import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronRight,
  Crosshair,
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
import SettingsMenu from './SettingsMenu';
import CreditsMenu from './CreditsMenu';
import AuthMenu from './AuthMenu';
import ProfileMenu from './ProfileMenu';
import UserAvatar from './UserAvatar';
import DailyChallengeCard from './DailyChallengeCard';
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

// Per-mode accent system. Full literal Tailwind class strings (never
// interpolated) so the JIT scanner keeps them; per-accent rgba lives in inline
// styles where dynamic color is genuinely needed.
type Accent = 'emerald' | 'sky' | 'amber';
const accentIcon: Record<Accent, string> = {
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  amber: 'text-amber-300',
};
const accentTile: Record<Accent, string> = {
  emerald: 'border-emerald-400/30 bg-emerald-500/[0.1] group-hover:border-emerald-300/55',
  sky: 'border-sky-400/30 bg-sky-500/[0.1] group-hover:border-sky-300/55',
  amber: 'border-amber-400/30 bg-amber-500/[0.1] group-hover:border-amber-300/55',
};

const MainMenu = ({ onClassicMode, onMultiplayerMode, onTutorialMode }: MainMenuProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signUp');
  const [pendingLaunch, setPendingLaunch] = useState<(() => void) | null>(null);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
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
      accent: 'emerald' as Accent,
      primary: true,
      onClick: onClassicMode,
      requiresAuth: false,
    },
    {
      key: 'multiplayer',
      icon: Users,
      title: 'Multiplayer',
      desc: 'Co-op survival with friends',
      accent: 'sky' as Accent,
      primary: false,
      onClick: onMultiplayerMode,
      requiresAuth: true,
    },
    {
      key: 'tutorial',
      icon: GraduationCap,
      title: 'Tutorial',
      desc: 'Learn the core mechanics',
      accent: 'amber' as Accent,
      primary: false,
      onClick: onTutorialMode,
      requiresAuth: false,
    },
  ] as const;

  const accessCard = !isAuthenticated
    ? isLoading
      ? {
          title: 'Checking session',
          copy: 'Verifying your session before you step into the forest.',
          tag: 'Standby',
        }
      : {
          title: 'Playing as guest',
          copy: 'Solo and Tutorial are open. Sign in to unlock Raise the Stakes run modifiers, Multiplayer, achievements, and the skill tree.',
          tag: 'Guest',
        }
    : null;

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Backdrop chrome (dark gradients + themed tint) is rendered at App
          level OUTSIDE the menu transition so it stays static while this
          screen slides. Only the content below animates. */}

      {/* Main Screen — fills exactly one viewport. A responsive two-column
          layout (identity left / actions right) on large screens keeps every
          state (incl. signed-in + daily challenge) on a single page; it
          collapses to a compact, centered single column below lg. The wrapper
          is m-auto centered with overflow-y-auto as a no-overlap safety net for
          extreme short/landscape viewports. */}
      {!showSettings && (
        <div className="relative z-10 h-dvh overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col px-5 sm:px-8 py-5 sm:py-6">
          <div className="m-auto w-full max-w-md lg:max-w-5xl">
            <div className="lg:grid lg:grid-cols-[1.05fr_minmax(0,27rem)] lg:gap-12 lg:items-center">

              {/* ── Identity column ─────────────────────────────────── */}
              <div className="title-reveal relative mb-6 lg:mb-0 text-center lg:text-left" style={{ '--title-tracking': '0.04em' } as CSSProperties}>
                <div className="flex items-center justify-center lg:justify-start gap-3 mb-3">
                  <span className="h-px w-9 sm:w-12 bg-gradient-to-r from-transparent to-emerald-400/60 lg:hidden" />
                  <p className="font-hud flex items-center gap-1.5 text-[10px] sm:text-[11px] tracking-[0.42em] text-emerald-300/90 font-semibold uppercase">
                    <Crosshair className="w-3 h-3" strokeWidth={2.2} />
                    Wave-Based Survival
                  </p>
                  <span className="h-px w-9 sm:w-12 bg-gradient-to-l from-transparent to-emerald-400/60" />
                </div>

                <h1 className="font-display title-bio font-semibold uppercase leading-[0.85] tracking-[0.02em] text-[clamp(2.5rem,10vw,3.5rem)] lg:text-[clamp(3.25rem,5vw,5.5rem)]">
                  Forest<br />Survival
                </h1>

                {/* Aurora horizon rule with a datum chip */}
                <div className="mt-3.5 flex items-center justify-center lg:justify-start gap-3">
                  <span className="aurora-rule h-px w-14 sm:w-24 bg-emerald-400/25 lg:hidden" />
                  <span className="font-hud text-[9px] sm:text-[10px] tracking-[0.4em] text-emerald-200/70 uppercase whitespace-nowrap">
                    Nightfall · The Clearing
                  </span>
                  <span className="aurora-rule h-px w-14 sm:w-24 bg-emerald-400/25" />
                </div>
              </div>

              {/* ── Actions column ──────────────────────────────────── */}
              <div className="menu-stagger flex w-full max-w-md mx-auto lg:mx-0 flex-col gap-2.5">
                {accessCard && (
                  <div className="hud-frame w-full rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] px-5 py-3.5 text-left"
                    style={{ '--hud-bracket': 'rgba(245,158,11,0.5)' } as CSSProperties}>
                    <div className="flex items-start gap-3.5">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl border border-amber-400/25 bg-amber-500/12 flex-shrink-0">
                        <LockKeyhole className="w-[18px] h-[18px] text-amber-300" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-hud text-[10px] tracking-[0.34em] font-semibold uppercase text-amber-300/90">
                          {accessCard.tag}
                        </p>
                        <h2 className="font-display text-base font-semibold uppercase tracking-wide text-white mt-0.5">{accessCard.title}</h2>
                        <p className="mt-1 text-xs leading-relaxed text-gray-300/80">{accessCard.copy}</p>
                      </div>
                    </div>
                  </div>
                )}

                {isAuthenticated && (
                  <div className="hud-frame w-full rounded-2xl border border-emerald-400/15 bg-white/[0.045] px-5 py-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.3)] backdrop-blur-md">
                    <div className="flex items-center gap-3.5">
                      <UserAvatar
                        name={currentUser?.name}
                        username={currentUser?.username}
                        image={currentUser?.image ?? null}
                        avatarIndex={avatarIndex}
                        size="lg"
                        className="border-emerald-400/20 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-hud text-[10px] tracking-[0.34em] text-emerald-300/90 font-semibold uppercase">
                          Operative Online
                        </p>
                        {profileLoading ? (
                          <div className="mt-2 space-y-2">
                            <div className="h-4 w-32 rounded-full bg-white/10" />
                            <div className="h-3 w-24 rounded-full bg-white/8" />
                          </div>
                        ) : (
                          <>
                            <h2 className="font-display mt-0.5 truncate text-xl font-semibold tracking-wide text-white">
                              {displayName}
                            </h2>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-hud truncate text-[13px] text-gray-300">{handle}</p>
                              {menuRank && (
                                <span
                                  className="font-hud inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                  style={{ color: menuRank.color, background: `${menuRank.color}1a`, border: `1px solid ${menuRank.color}44` }}
                                >
                                  <Trophy className="w-2.5 h-2.5" strokeWidth={2.5} /> {menuRank.tierName} · Lvl {menuRank.level}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="hidden sm:flex flex-col items-stretch gap-1.5">
                        <button
                          onClick={isAuthenticated ? openProfile : () => openAuth('signIn')}
                          className="font-hud inline-flex items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-500/[0.12] hover:text-white"
                        >
                          Profile
                        </button>
                        {isAuthenticated && (
                          <button
                            onClick={handleSignOut}
                            className="font-hud inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/[0.06]"
                          >
                            Sign Out
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Daily Challenge — signed-in only, today's rolled goal + claim. */}
                {isAuthenticated && <DailyChallengeCard />}

                {/* ── Mode selection ──────────────────────────────────── */}
                {modes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => launchMode(mode.onClick, mode.requiresAuth)}
                      className={`group flex items-center gap-4 w-full rounded-2xl py-3.5 px-4 text-left
                        border backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0
                        ${mode.primary
                          ? 'border-emerald-400/30 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.1] hover:border-emerald-300/50'
                          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'}`}
                    >
                      <span className={`flex items-center justify-center w-12 h-12 rounded-xl border flex-shrink-0 transition-colors duration-300 ${accentTile[mode.accent]}`}>
                        <Icon className={`w-6 h-6 ${accentIcon[mode.accent]}`} strokeWidth={1.85} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-display block text-xl font-semibold uppercase tracking-wide text-white leading-none">
                          {mode.title}
                        </span>
                        <span className="font-hud mt-1 block text-[11px] text-gray-400 truncate">
                          {mode.desc}
                        </span>
                      </span>
                      <ChevronRight
                        className="w-5 h-5 text-gray-600 transition-all duration-300 group-hover:text-gray-200 group-hover:translate-x-0.5"
                        strokeWidth={2}
                      />
                    </button>
                  );
                })}

                {/* Secondary actions — Settings · Credits · Account */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="font-hud group flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5
                      text-[11px] font-semibold uppercase tracking-wider text-gray-400 border border-white/10 bg-white/[0.02]
                      transition-all duration-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20"
                  >
                    <Settings className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-500" strokeWidth={2} />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={() => setShowCredits(true)}
                    className="font-hud group flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5
                      text-[11px] font-semibold uppercase tracking-wider text-gray-400 border border-white/10 bg-white/[0.02]
                      transition-all duration-300 hover:text-emerald-300 hover:bg-emerald-500/[0.06] hover:border-emerald-400/30"
                  >
                    <Sparkles className="w-3.5 h-3.5 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} fill="currentColor" />
                    <span>Credits</span>
                  </button>
                  <button
                    onClick={isAuthenticated ? openProfile : () => openAuth('signIn')}
                    className={`font-hud group flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider border transition-all duration-300 ${
                      isAuthenticated
                        ? 'text-emerald-300 border-emerald-400/25 bg-emerald-500/[0.05] hover:text-white hover:bg-emerald-500/[0.1] hover:border-emerald-300/40'
                        : 'text-sky-300 border-sky-400/25 bg-sky-500/[0.05] hover:text-white hover:bg-sky-500/[0.1] hover:border-sky-300/40'
                    }`}
                  >
                    {isAuthenticated ? (
                      <UserRound className="w-3.5 h-3.5 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} />
                    ) : (
                      <LogIn className="w-3.5 h-3.5 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} />
                    )}
                    <span>{isAuthenticated ? 'Account' : 'Sign In / Up'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Utility footer ──────────────────────────────────────── */}
            <div className="font-hud mt-6 lg:mt-8 flex items-center justify-center lg:justify-start gap-2.5 text-[10px] tracking-[0.3em] text-gray-600 uppercase">
              <span>v1.0</span>
              <span className="h-1 w-1 rounded-full bg-emerald-400/60 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <button
                onClick={() => setShowCredits(true)}
                className="tracking-[0.3em] transition-colors hover:text-emerald-300"
              >
                vibe-coded by <span className="font-semibold text-gray-400">Surya</span>
              </button>
            </div>
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
