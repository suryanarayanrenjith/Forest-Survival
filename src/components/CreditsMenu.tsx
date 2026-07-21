import {
  Sparkles, Heart, Code2, ExternalLink, X,
  Cpu, Wand2, Palette, Boxes, Zap, ArrowUpRight, Layers3,
  Database, ShieldCheck, Triangle, GitFork, Crosshair, BookOpen,
  Gamepad2, Network, Brush, Cog, Bone, HeartHandshake,
  type LucideIcon,
} from 'lucide-react';
import { detectIsTouch } from '../hooks/useDeviceInfo';

interface CreditsMenuProps {
  onClose: () => void;
}

interface TechItem {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
}

// Film-style credit roll. The device is honest: a single person filled every
// role, so listing the disciplines IS the story — not decoration.
const ROLES: Array<{ role: string; icon: LucideIcon }> = [
  { role: 'Game Design & Direction', icon: Gamepad2 },
  { role: 'Engineering & Architecture', icon: Code2 },
  { role: '3D, Shaders & Post-FX', icon: Boxes },
  { role: 'Multiplayer Netcode', icon: Network },
  { role: 'UI / UX & Art Direction', icon: Brush },
  { role: 'Systems & Balancing', icon: Cog },
];

const STATS: Array<{ value: string; label: string }> = [
  { value: 'Solo', label: 'Built by one' },
  { value: '100%', label: 'Vibe-coded' },
  { value: 'MIT', label: 'Open source' },
];

const TECH_STACK: TechItem[] = [
  { label: 'React 19',          hint: 'TypeScript · strict',     icon: Code2,   accent: '#38bdf8' },
  { label: 'Three.js',          hint: 'r180 · WebGL2',           icon: Boxes,   accent: '#34d399' },
  { label: 'Rapier Physics',    hint: 'Ragdolls · WASM solver',  icon: Bone,    accent: '#fb7185' },
  { label: '@react-three/fiber', hint: 'Loader scene · Canvas',   icon: Layers3, accent: '#60a5fa' },
  { label: '@react-three/drei',  hint: 'Preload · helpers',       icon: Sparkles, accent: '#a78bfa' },
  { label: 'three.js Postprocessing', hint: 'Bloom · GTAO · ACES · SMAA · God-rays · CAS', icon: Wand2,   accent: '#c084fc' },
  { label: 'Convex',            hint: 'Realtime DB · serverless', icon: Database, accent: '#f97316' },
  { label: 'Convex Auth',       hint: 'Accounts · sessions',     icon: ShieldCheck, accent: '#22d3ee' },
  { label: 'Tailwind + Lucide', hint: 'Design system',           icon: Palette, accent: '#fbbf24' },
  { label: 'PeerJS',            hint: 'P2P multiplayer',         icon: Cpu,     accent: '#f87171' },
  { label: 'Vite',              hint: 'HMR · ESBuild',           icon: Zap,     accent: '#fb923c' },
  { label: 'Vercel',            hint: 'Hosting · CI build',      icon: Triangle, accent: '#e5e7eb' },
];

const CreditsMenu = ({ onClose }: CreditsMenuProps) => {
  const portfolioUrl = 'https://surya.is-a.dev/';
  const githubUrl = 'https://github.com/suryanarayanrenjith/Forest-Survival';
  const wikiUrl = 'https://github.com/suryanarayanrenjith/Forest-Survival/wiki';
  const isTouch = detectIsTouch();

  return (
    <>
      {/* Backdrop blur lives on its own layer — kept lightly translucent so the
          living forest still glows behind the dossier. Never invalidated by
          child scroll (no backdrop-filter on the scroll container). */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(4,8,7,0.9)', backdropFilter: 'blur(16px)' }}
      />
      {/* The panel owns the only scroll surface. Keeping the page-sized overlay
          static avoids nested scroll containers fighting over wheel/touch input
          and keeps every row on a stable compositing layer. On touch it becomes
          a full-bleed sheet instead of a centered dossier card. */}
      <div className={isTouch
        ? 'm-safe fixed inset-0 z-50 flex flex-col menu-overlay-in'
        : 'fixed inset-0 z-50 grid place-items-center p-4 sm:p-6 menu-overlay-in'}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        className={isTouch
          ? 'm-sheet-in relative flex h-full w-full flex-col overflow-hidden border-t border-emerald-400/15 bg-[#080d0b] isolate'
          : 'hud-frame relative flex w-full max-w-3xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border border-emerald-400/15 bg-[#080d0b] shadow-[0_40px_100px_rgba(0,0,0,0.6)] isolate'}
        style={isTouch ? undefined : { animation: 'crFade 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Ambient drifting bloom — pure atmosphere behind the content */}
        <div
          className="panel-drift pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(46,232,180,0.16), transparent 70%)' }}
        />

        {/* Header */}
        <div className={`relative flex flex-none items-center justify-between border-b border-white/[0.07] ${isTouch ? 'gap-2 px-3 py-1.5' : 'px-5 py-4 sm:px-6'}`}>
          <div className={`flex items-center ${isTouch ? 'gap-2' : 'gap-3'}`}>
            <div className={`relative flex items-center justify-center rounded-lg bg-emerald-500/12 border border-emerald-400/30 ${isTouch ? 'h-7 w-7' : 'w-10 h-10 rounded-xl'}`}>
              <Sparkles className={isTouch ? 'h-4 w-4 text-emerald-300' : 'w-5 h-5 text-emerald-300'} strokeWidth={2} fill="currentColor" />
              {!isTouch && <span className="absolute inset-0 rounded-xl border border-emerald-400/30" style={{ animation: 'crPulse 2.6s ease-in-out infinite' }} />}
            </div>
            <div>
              {!isTouch && (
                <p className="font-hud text-[10px] tracking-[0.36em] text-emerald-300/90 font-semibold uppercase">
                  Credits
                </p>
              )}
              <h2 id="credits-title" className={`font-display font-semibold uppercase tracking-wide text-white ${isTouch ? 'text-sm leading-none' : 'text-lg'}`}>
                {isTouch ? 'Credits' : 'Forest Survival'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close credits"
            className={`flex flex-none items-center justify-center rounded-lg border border-white/10 text-gray-400
              transition-colors hover:text-white hover:bg-white/[0.06] ${isTouch ? 'm-tap h-8 w-8' : 'w-9 h-9'}`}
          >
            <X className={isTouch ? 'h-4 w-4' : 'w-[18px] h-[18px]'} strokeWidth={2.25} />
          </button>
        </div>

        <div className={`m-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] ${isTouch ? 'space-y-5 p-4' : 'space-y-7 p-5 sm:p-7'}`}>
          {/* ── Hero ─────────────────────────────────────────────────── */}
          <div className={`relative overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.035] ${isTouch ? 'p-4' : 'p-5 sm:p-6'}`}>
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-left">
                <p className="font-hud flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.36em] text-emerald-300/80">
                  <Crosshair className="h-3 w-3" strokeWidth={2.2} /> A solo project by
                </p>
                <h3 className={`font-display title-bio mt-2 font-semibold uppercase leading-none tracking-[0.04em] ${isTouch ? 'text-4xl' : 'text-5xl sm:text-6xl'}`}>
                  Surya
                </h3>
                <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-gray-300/90">
                  A fully-featured 3D wave-survival shooter with procedural terrain, character abilities,
                  snapshot-interpolated multiplayer, photo mode, and more — built from a blank file through conversational AI.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:w-44 sm:grid-cols-1">
                {STATS.map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-white/[0.08] bg-black/15 px-2.5 py-2.5 sm:px-3 sm:py-2">
                    <p className="font-display text-xl font-semibold leading-none text-emerald-300 sm:text-2xl">{stat.value}</p>
                    <p className="font-hud mt-1 text-[8.5px] uppercase tracking-[0.16em] text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Credit roll ───────────────────────────────────────────── */}
          <div>
            <SectionLabel>One Person, Every Role</SectionLabel>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLES.map(({ role, icon: Icon }) => (
                <li key={role} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-emerald-400/20 hover:bg-emerald-500/[0.035]">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-500/[0.07]">
                    <Icon className="h-4 w-4 text-emerald-400/80" strokeWidth={2} />
                  </span>
                  <span className="font-hud min-w-0 flex-1 text-[11px] tracking-wide text-gray-300">{role}</span>
                  <span className="font-display text-xs font-semibold uppercase tracking-wide text-white/75">Surya</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Portfolio CTA ──────────────────────────────────────────── */}
          <div>
            <SectionLabel>Explore the Project</SectionLabel>
            <div className="mt-3 space-y-2.5">
          <a
            href={portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-4 w-full rounded-2xl overflow-hidden p-[1px]
              transition-transform duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, rgba(52,211,153,0.5), rgba(56,189,248,0.4), rgba(192,132,252,0.4))',
            }}
          >
            <span className="relative flex items-center gap-4 w-full rounded-2xl bg-[#080d0b] px-4 sm:px-5 py-4
              group-hover:bg-[#0a120f] transition-colors">
              <span className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/12 border border-emerald-400/30 flex-shrink-0">
                <ExternalLink className="w-[18px] h-[18px] text-emerald-300" strokeWidth={2} />
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: '0 0 18px -4px rgba(52,211,153,0.5)' }}
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-hud block text-[10px] font-bold tracking-[0.24em] text-emerald-300/90 uppercase mb-0.5">
                  Surya Portfolio
                </span>
                <span className="block text-base font-bold text-white tracking-tight truncate">
                  surya.is-a.dev
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  More about me, my work, and ways to get in touch
                </span>
              </span>
              <span className="font-hud flex items-center gap-1 text-emerald-300 group-hover:translate-x-0.5 transition-transform">
                <span className="text-[10px] font-bold tracking-[0.24em] uppercase">Visit</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
              </span>
            </span>
          </a>

          {/* ── GitHub CTA ─────────────────────────────────────────────── */}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-4 w-full rounded-2xl overflow-hidden p-[1px]
              transition-transform duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, rgba(148,163,184,0.4), rgba(100,116,139,0.3), rgba(71,85,105,0.3))',
            }}
          >
            <span className="relative flex items-center gap-4 w-full rounded-2xl bg-[#080d0b] px-4 sm:px-5 py-4
              group-hover:bg-[#0a120f] transition-colors">
              <span className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-slate-500/12 border border-slate-400/30 flex-shrink-0">
                <GitFork className="w-[18px] h-[18px] text-slate-300" strokeWidth={2} />
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: '0 0 18px -4px rgba(148,163,184,0.35)' }}
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-hud block text-[10px] font-bold tracking-[0.24em] text-slate-300/90 uppercase mb-0.5">
                  Open Source · MIT
                </span>
                <span className="block text-base font-bold text-white tracking-tight truncate">
                  github.com / Forest-Survival
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  Source code, issues, and contributions welcome
                </span>
              </span>
              <span className="font-hud flex items-center gap-1 text-slate-300 group-hover:translate-x-0.5 transition-transform">
                <span className="text-[10px] font-bold tracking-[0.24em] uppercase">Star</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
              </span>
            </span>
          </a>

          {/* ── Wiki CTA ───────────────────────────────────────────────── */}
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center gap-4 w-full rounded-2xl overflow-hidden p-[1px]
              transition-transform duration-300 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.45), rgba(52,211,153,0.3), rgba(56,189,248,0.25))',
            }}
          >
            <span className="relative flex items-center gap-4 w-full rounded-2xl bg-[#080d0b] px-4 sm:px-5 py-4
              group-hover:bg-[#0a120f] transition-colors">
              <span className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/12 border border-amber-400/30 flex-shrink-0">
                <BookOpen className="w-[18px] h-[18px] text-amber-300" strokeWidth={2} />
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: '0 0 18px -4px rgba(251,191,36,0.4)' }}
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-hud block text-[10px] font-bold tracking-[0.24em] text-amber-300/90 uppercase mb-0.5">
                  Game Wiki
                </span>
                <span className="block text-base font-bold text-white tracking-tight truncate">
                  Full mechanics reference
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  Weapons, enemies, characters, systems — every confirmed number
                </span>
              </span>
              <span className="font-hud flex items-center gap-1 text-amber-300 group-hover:translate-x-0.5 transition-transform">
                <span className="text-[10px] font-bold tracking-[0.24em] uppercase">Browse</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
              </span>
            </span>
          </a>
            </div>
          </div>

          {/* ── Special Thanks ─────────────────────────────────────────── */}
          <div>
            <SectionLabel>Special Thanks</SectionLabel>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/30 flex-shrink-0">
                <HeartHandshake className="w-[18px] h-[18px] text-emerald-300" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-gray-300/90 leading-snug">
                  Custom domain provided by <span className="font-bold text-white">smsolutionsva-byte</span>
                </span>
                <span className="font-hud block mt-0.5 text-[10.5px] text-gray-500">
                  Thank you for giving the game a home on the web
                </span>
              </span>
            </div>
          </div>

          {/* ── Tech Stack ─────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Built With</SectionLabel>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TECH_STACK.map(({ label, hint, icon: Icon, accent }) => (
                <li
                  key={label}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5
                    transition-all hover:border-white/15 hover:bg-white/[0.04]"
                >
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 transition-transform group-hover:scale-105"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}40` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: accent }} strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-white truncate">{label}</span>
                    <span className="font-hud block text-[10.5px] text-gray-500 truncate">{hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="border-t border-white/[0.06] pt-5 text-center">
            <p className="font-hud flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
              Crafted with
              <Heart className="w-3.5 h-3.5 text-red-400" strokeWidth={2.25} fill="currentColor" />
              and a lot of care
            </p>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes crFade {
          from { opacity: 0; transform: scale(0.95) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes crPulse {
          0%, 100% { opacity: 0; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
      `}</style>
    </div>
    </>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    <p className="font-hud text-[10px] font-bold tracking-[0.34em] text-gray-400 uppercase whitespace-nowrap">
      {children}
    </p>
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
  </div>
);

export default CreditsMenu;
