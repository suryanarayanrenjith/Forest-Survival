import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronRight,
  Clapperboard,
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
import { useDeviceInfo } from '../hooks/useDeviceInfo';
import SettingsMenu from './SettingsMenu';
import CreditsMenu from './CreditsMenu';
import { CORNER_PILL_SURFACE } from './cornerPillSurface';
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
  /** Opens the shared Skill Tree overlay (App owns the state). Signed-in only;
   *  guests are routed through sign-in first. */
  onSkillTree: () => void;
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

// Same repo the Credits screen links to — kept in sync with that "source of truth".
const GITHUB_URL = 'https://github.com/suryanarayanrenjith/Forest-Survival';

// lucide-react ships no brand/logo icons (GitHub's mark included), so the
// canonical Octicons "mark-github" glyph is inlined here instead of pulling
// in a whole extra icon package for one mark.
const GithubMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const MainMenu = ({ onClassicMode, onMultiplayerMode, onTutorialMode, onSkillTree }: MainMenuProps) => {
  const { isTouch } = useDeviceInfo();
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

  // Hidden behind any full-screen overlay (Settings/Credits/Auth/Profile all
  // paint above it at the same z-tier) so it never floats over a modal.
  const menuIdle = !showSettings && !showCredits && !showAuth && !showProfile;

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Backdrop chrome (dark gradients + themed tint) is rendered at App
          level OUTSIDE the menu transition so it stays static while this
          screen slides. Only the content below animates. */}

      {/* Star on GitHub — top-right support CTA, placed where it's seen
          immediately (not tucked in a corner below the fold). Opens the repo
          in a new tab — GitHub's own Star control lives there; this app
          can't star on the user's behalf without OAuth, so linking there is
          the honest ask. Desktop: a 44px circle that expands into a labeled
          pill on hover (real :hover only — gated behind isTouch so touch
          devices, which have no true hover state and are prone to it
          "sticking" after a tap, never get the expand treatment and always
          render the plain icon).
          The hover width is a `max-width` transition (44px → a generous
          260px ceiling) rather than an animated fixed target width — the box
          has no explicit `width`, so it always shrink-to-fits its actual
          content and settles there well before the ceiling is reached. That
          keeps the icon/text padding symmetric and leaves no dead space
          after the label, regardless of exact font-metric rendering. */}
      {menuIdle && (
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Star Forest Survival on GitHub"
          className={
            // Collapsed surface = CORNER_PILL_SURFACE, shared with the music
            // mute pill so the two corner buttons always match at rest.
            isTouch
              ? `fixed top-5 right-5 z-40 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full ${CORNER_PILL_SURFACE} focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70`
              : `group fixed top-5 right-5 z-40 flex h-11 max-w-[44px] items-center gap-2 overflow-hidden rounded-full ${CORNER_PILL_SURFACE} px-[13px] transition-all duration-300 ease-out hover:max-w-[260px] hover:-translate-y-0.5 hover:border-amber-400/45 hover:bg-amber-500/[0.14] hover:text-amber-200 hover:shadow-[0_10px_32px_-10px_rgba(251,191,36,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70`
          }
        >
          <GithubMark className="h-[18px] w-[18px] flex-shrink-0" />
          {!isTouch && (
            <span className="font-hud whitespace-nowrap text-xs font-bold uppercase tracking-wider opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Star on GitHub
            </span>
          )}
        </a>
      )}

      {/* Main Screen — fills exactly one viewport. Cinematic two-column
          composition that matches the live backdrop: the WORDMARK + trailer
          tile sit on the sunlit left (the scene's hot light frames the title),
          the actions on the calm deep forest to the right. Collapses to one
          centred column below lg. m-auto inside a min-h-full flex column with
          overflow-y-auto stays the no-overlap safety net for short viewports. */}
      {!showSettings && (
        <div className="relative z-10 h-dvh overflow-y-auto overscroll-contain">
        <div className={`m-safe flex min-h-full flex-col ${isTouch ? 'px-4 py-4' : 'px-5 sm:px-8 py-5 sm:py-6'}`}>
          <div className={`m-auto w-full ${isTouch ? 'max-w-md md:max-w-4xl' : 'max-w-md lg:max-w-6xl'}`}>
            <div className={isTouch
              ? 'md:grid md:grid-cols-[1fr_minmax(0,23rem)] md:gap-8 md:items-center'
              : 'lg:grid lg:grid-cols-[1.1fr_minmax(0,27rem)] lg:gap-16 lg:items-center'}>

              {/* ── Identity: wordmark + trailer ───────────────────────── */}
              <div className={`relative flex flex-col ${isTouch ? 'mb-5 items-center text-center md:mb-0 md:items-start md:text-left' : 'mb-7 items-center text-center lg:mb-0 lg:items-start lg:text-left'}`}>
                <div className="title-reveal" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.75), 0 0 18px rgba(0,0,0,0.35)' }}>
                  <p
                    className="font-hud flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.42em] text-emerald-100 sm:text-[11px]"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.7)' }}
                  >
                    <span className="h-px w-8 bg-gradient-to-r from-transparent to-emerald-300/70" />
                    Wave-Based Survival FPS
                  </p>
                  {/* The wordmark is the document's single <h1> (SEO: it used
                      to be a span, leaving the page with no H1 at all). */}
                  <h1
                    className={`title-bio font-display mt-3 font-bold uppercase leading-[0.86] ${isTouch ? 'text-[clamp(2.6rem,11vw,3.6rem)]' : 'text-[clamp(2.9rem,11vw,4rem)] lg:text-[clamp(4.2rem,6.4vw,6.4rem)]'}`}
                    style={{ ['--title-tracking' as string]: '0.015em', letterSpacing: '0.015em', textShadow: 'none' } as CSSProperties}
                  >
                    Forest<br />Survival
                  </h1>
                  <div className={`aurora-rule mt-4 h-px w-56 bg-gradient-to-r from-emerald-300/70 via-cyan-300/40 to-transparent ${isTouch ? 'mx-auto md:mx-0' : 'mx-auto lg:mx-0'}`} />
                  <p className="font-hud mt-3 max-w-sm text-[12px] leading-relaxed tracking-wide text-white/70 sm:text-[13px]">
                    Hold the forest against endless robot waves. Eight maps, eight weapons, one last stand.
                  </p>
                </div>

                {/* Trailer tile — a framed media card, not a second hero. */}
                <section
                  className={`hud-frame mt-6 w-full max-w-[25rem] overflow-hidden border border-white/[0.12] bg-[#050a08]/85 text-left shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${isTouch ? '' : 'lg:max-w-[26rem]'}`}
                  style={{ borderRadius: '14px 3.5px' }}
                >
                  <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-2.5">
                    <Clapperboard className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.15} />
                    <span className="font-hud text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">Official Trailer</span>
                    <span className="ml-auto font-hud text-[9px] font-semibold uppercase tracking-[0.3em] text-emerald-300/70">0:57</span>
                  </div>
                  <video
                    className="block aspect-video w-full bg-black object-cover"
                    controls
                    playsInline
                    preload="metadata"
                    poster="/og-image.jpg"
                    aria-label="Forest Survival official trailer"
                  >
                    <source src="/media/forest-survival-trailer.mp4" type="video/mp4" />
                    Your browser does not support the trailer video.
                  </video>
                </section>
              </div>

              {/* ── Actions column ──────────────────────────────────── */}
              <div className={`menu-stagger flex w-full max-w-md flex-col gap-2.5 ${isTouch ? 'mx-auto md:mx-0' : 'mx-auto lg:mx-0'}`}>
                {accessCard && (
                  <div
                    className="w-full border border-amber-300/20 bg-[#0b0905]/80 px-4 py-3 text-left shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
                    style={{ borderRadius: '10px 2.5px' }}
                  >
                    <div className="flex items-start gap-3">
                      <LockKeyhole className="mt-0.5 w-4 h-4 flex-shrink-0 text-amber-300" strokeWidth={2.2} />
                      <div className="min-w-0">
                        <p className="font-hud text-[9px] tracking-[0.36em] font-semibold uppercase text-amber-300/90">
                          {accessCard.tag}
                        </p>
                        {/* Session-state label — a <p>, not a heading (it used
                            to outrank the real title in the document outline). */}
                        <p className="font-display text-[15px] font-semibold uppercase tracking-wide text-white mt-0.5">{accessCard.title}</p>
                        <p className="font-hud mt-1 text-[11px] leading-relaxed text-white/60">{accessCard.copy}</p>
                      </div>
                    </div>
                  </div>
                )}

                {isAuthenticated && (
                  <div
                    className="w-full border border-emerald-300/15 bg-[#050c09]/80 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
                    style={{ borderRadius: '10px 2.5px' }}
                  >
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
                        <p className="font-hud text-[9px] tracking-[0.36em] text-emerald-300/90 font-semibold uppercase">
                          Operative Online
                        </p>
                        {profileLoading ? (
                          <div className="mt-2 space-y-2">
                            <div className="h-4 w-32 rounded-full bg-white/10" />
                            <div className="h-3 w-24 rounded-full bg-white/[0.08]" />
                          </div>
                        ) : (
                          <>
                            {/* The signed-in player's name — a <p>, not a heading. */}
                            <p className="font-display mt-0.5 truncate text-xl font-semibold tracking-wide text-white">
                              {displayName}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-hud truncate text-[12px] text-white/60">{handle}</p>
                              {menuRank && (
                                <span
                                  className="font-hud inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                  style={{ color: menuRank.color, background: `${menuRank.color}1a`, border: `1px solid ${menuRank.color}44` }}
                                >
                                  <Trophy className="w-2.5 h-2.5" strokeWidth={2.5} /> {menuRank.tierName} · Lvl {menuRank.level}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="hidden sm:flex">
                        <button
                          onClick={handleSignOut}
                          className="font-hud inline-flex items-center justify-center border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Daily Challenge — signed-in only, today's rolled goal + claim. */}
                {isAuthenticated && <DailyChallengeCard />}

                {/* ── Mode selection ──────────────────────────────────── */}
                {modes.map((mode, index) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => launchMode(mode.onClick, mode.requiresAuth)}
                      className={`group relative flex w-full items-center gap-4 overflow-hidden py-3.5 pl-5 pr-4 text-left
                        border transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0
                        ${mode.primary
                          ? 'border-emerald-300/40 bg-[#062018]/85 hover:border-emerald-200/65'
                          : 'border-white/[0.09] bg-[#060b09]/80 hover:border-white/25 hover:bg-[#0a120f]/90'}`}
                      style={{ borderRadius: '12px 3px' }}
                    >
                      {/* Accent spine — grows on hover; always lit on the primary mode. */}
                      <span
                        className={`absolute left-0 top-0 h-full w-[3px] origin-center transition-transform duration-300 ${mode.primary ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-100'}`}
                        style={{ background: mode.accent === 'emerald' ? '#2ee8b4' : mode.accent === 'sky' ? '#39b8e6' : '#ffb265' }}
                      />
                      {/* Sweep highlight on hover. */}
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/[0.06] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <span aria-hidden="true" className="font-display w-7 flex-shrink-0 text-sm font-semibold text-white/35 tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center border transition-colors duration-300 ${accentTile[mode.accent]}`}>
                        <Icon className={`h-[22px] w-[22px] ${accentIcon[mode.accent]}`} strokeWidth={1.85} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-display block text-[22px] font-semibold uppercase leading-none tracking-wide text-white">
                          {mode.title}
                        </span>
                        <span className="font-hud mt-1.5 block truncate text-[11px] tracking-wide text-white/55">
                          {mode.desc}
                        </span>
                      </span>
                      {mode.requiresAuth && !isAuthenticated && (
                        <LockKeyhole className="h-3.5 w-3.5 flex-shrink-0 text-white/35" strokeWidth={2.2} />
                      )}
                      <ChevronRight
                        className="h-5 w-5 flex-shrink-0 text-white/30 transition-all duration-300 group-hover:translate-x-1 group-hover:text-white"
                        strokeWidth={2}
                      />
                    </button>
                  );
                })}

                {/* Secondary actions — Settings · Credits · Account */}
                <div className="mt-1 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="font-hud group flex items-center justify-center gap-1.5 px-2 py-2.5
                      text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 border border-white/[0.09] bg-[#060b09]/75
                      transition-all duration-300 hover:text-white hover:border-white/25"
                  >
                    <Settings className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-500" strokeWidth={2} />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={() => setShowCredits(true)}
                    className="font-hud group flex items-center justify-center gap-1.5 px-2 py-2.5
                      text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 border border-white/[0.09] bg-[#060b09]/75
                      transition-all duration-300 hover:text-emerald-200 hover:border-emerald-300/35"
                  >
                    <Sparkles className="w-3.5 h-3.5 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} fill="currentColor" />
                    <span>Credits</span>
                  </button>
                  <button
                    onClick={isAuthenticated ? openProfile : () => openAuth('signIn')}
                    className={`font-hud group flex items-center justify-center gap-1.5 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] border transition-all duration-300 ${
                      isAuthenticated
                        ? 'text-emerald-200 border-emerald-300/25 bg-[#062018]/70 hover:text-white hover:border-emerald-200/45'
                        : 'text-sky-200 border-sky-300/25 bg-[#06121a]/70 hover:text-white hover:border-sky-200/45'
                    }`}
                  >
                    {isAuthenticated ? (
                      <UserRound className="w-3.5 h-3.5 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} />
                    ) : (
                      <LogIn className="w-3.5 h-3.5 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} />
                    )}
                    <span>{isAuthenticated ? 'Account' : 'Sign In'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Site nav + utility footer ───────────────────────────────
                Real <a href> links to the static content pages — the ONLY crawl
                path out of the homepage in the RENDERED DOM (the index.html
                <noscript> block covers raw-HTML / AI crawlers, but noscript is
                not part of the rendered DOM Googlebot indexes). It must stay
                VISIBLE — a sr-only nav would read as cloaking. Near-white text
                with a tight + a soft shadow holds contrast over the sunlit
                grass and every time-of-day / graphics state of the backdrop. */}
            <div className={`w-full border-t border-white/[0.08] ${isTouch ? 'mt-5 pt-3' : 'mt-7 pt-4 lg:mt-10'}`}>
              <nav
                aria-label="About Forest Survival"
                className="font-hud flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] font-semibold tracking-[0.24em] text-white/85 uppercase lg:justify-start"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.6)' }}
              >
                <a href="/guide" className="transition-colors hover:text-emerald-300">Guide</a>
                <a href="/how-to-play" className="transition-colors hover:text-emerald-300">How to Play</a>
                <a href="/weapons" className="transition-colors hover:text-emerald-300">Weapons</a>
                <a href="/characters" className="transition-colors hover:text-emerald-300">Classes</a>
                <a href="/enemies" className="transition-colors hover:text-emerald-300">Robot Enemies</a>
                <a href="/maps" className="transition-colors hover:text-emerald-300">Maps</a>
                <a href="/multiplayer" className="transition-colors hover:text-emerald-300">Multiplayer</a>
                <a href="/faq" className="transition-colors hover:text-emerald-300">FAQ</a>
                <a href="/about" className="transition-colors hover:text-emerald-300">About</a>
              </nav>

              <div
                className="font-hud mt-2.5 flex items-center justify-center gap-2.5 text-[10px] tracking-[0.3em] text-white/60 uppercase lg:justify-start"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.6)' }}
              >
                <span>v2.0</span>
                <span className="h-1 w-1 rounded-full bg-emerald-400/60 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <button
                  onClick={() => setShowCredits(true)}
                  className="tracking-[0.3em] transition-colors hover:text-emerald-300"
                >
                  vibe-coded by <span className="font-semibold text-white/70">Surya</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}

      {showCredits && <CreditsMenu onClose={() => setShowCredits(false)} />}

      {showAuth && <AuthMenu onClose={closeAuth} onSignedIn={() => setShowAuth(false)} initialMode={authMode} />}

      {/* Profile Menu — the skill tree lives inside here now (Overview tab). */}
      {showProfile && <ProfileMenu onClose={closeProfile} onSkillTree={onSkillTree} />}
    </div>
  );
};

export default MainMenu;
