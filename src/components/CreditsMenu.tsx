import {
  Sparkles, Heart, Code2, ExternalLink, X, ArrowLeft,
  Cpu, Wand2, Palette, Boxes, Gamepad2, Zap, ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';

interface CreditsMenuProps {
  onClose: () => void;
}

interface TechItem {
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
}

const TECH_STACK: TechItem[] = [
  { label: 'React 19',          hint: 'TypeScript · strict',     icon: Code2,   accent: '#38bdf8' },
  { label: 'Three.js',          hint: 'r180 · WebGL2',           icon: Boxes,   accent: '#34d399' },
  { label: 'pmndrs Postprocessing', hint: 'Bloom · ACES · SMAA', icon: Wand2,   accent: '#c084fc' },
  { label: 'Tailwind + Lucide', hint: 'Design system',           icon: Palette, accent: '#fbbf24' },
  { label: 'PeerJS',            hint: 'P2P multiplayer',         icon: Cpu,     accent: '#f87171' },
  { label: 'Vite',              hint: 'HMR · ESBuild',           icon: Zap,     accent: '#fb923c' },
];

const CreditsMenu = ({ onClose }: CreditsMenuProps) => {
  const portfolioUrl = 'https://surya.is-a.dev/';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(5,8,10,0.94)', backdropFilter: 'blur(14px)' }}
    >
      {/* Soft atmospheric backdrop — emerald radial glow + faint grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(34,197,94,0.10), transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />

      <div
        className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f15] overflow-hidden"
        style={{ animation: 'crFade 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Top emerald accent line + ambient glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent" />
        <div
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[260px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.22) 0%, transparent 70%)' }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/30">
              <Sparkles className="w-5 h-5 text-emerald-300" strokeWidth={2} fill="currentColor" />
              <span className="absolute inset-0 rounded-xl border border-emerald-400/30" style={{ animation: 'crPulse 2.6s ease-in-out infinite' }} />
            </div>
            <div>
              <p className="text-[10px] tracking-[0.35em] text-emerald-300/90 font-semibold uppercase">
                Credits
              </p>
              <h2 className="text-lg font-bold text-white tracking-wide">Forest Survival</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close credits"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400
              transition-colors hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </button>
        </div>

        <div className="relative p-5 sm:p-7 space-y-6 max-h-[78vh] overflow-y-auto">
          {/* ── Hero — vibe-coded by Surya ─────────────────────────────── */}
          <div className="relative rounded-2xl overflow-hidden">
            {/* Layered gradient backdrop */}
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  'radial-gradient(120% 80% at 0% 0%, rgba(34,197,94,0.18) 0%, transparent 60%),' +
                  'radial-gradient(120% 80% at 100% 100%, rgba(56,189,248,0.10) 0%, transparent 60%),' +
                  'linear-gradient(160deg, rgba(11,15,21,0.6) 0%, rgba(11,15,21,0.9) 100%)',
              }}
            />
            <div className="absolute inset-0 rounded-2xl border border-emerald-400/30" />
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

            <div className="relative px-5 sm:px-6 py-6">
              {/* Chip row */}
              <div className="flex items-center gap-2 mb-3.5">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-400/30 bg-emerald-500/10">
                  <Gamepad2 className="w-3 h-3 text-emerald-300" strokeWidth={2.5} />
                  <span className="text-[10px] font-bold tracking-[0.18em] text-emerald-300 uppercase">
                    Vibe-Coded
                  </span>
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03]">
                  <span className="text-[10px] font-bold tracking-[0.18em] text-gray-300 uppercase">
                    2026
                  </span>
                </span>
              </div>

              {/* Hero name */}
              <p className="text-[11px] tracking-[0.32em] text-emerald-300/80 font-semibold uppercase mb-1">
                Designed · Directed · Shipped by
              </p>
              <h3
                className="text-5xl sm:text-6xl font-black tracking-tight leading-[0.95] mb-4"
                style={{
                  background: 'linear-gradient(180deg, #f0fdf4 0%, #86efac 45%, #22c55e 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 4px 20px rgba(34,197,94,0.45))',
                }}
              >
                Surya
              </h3>

              {/* Pull-quote style description */}
              <p className="text-[14px] leading-relaxed text-gray-300/95 max-w-prose">
                A full first-person survival shooter — wave-based combat, multiplayer, abilities,
                skill trees, weather, day-night cycles, eight biomes, and a real post-processing
                pipeline — conjured into existence one prompt at a time. Every system, every
                shader, every interface was specified by direction, refined by conversation, and
                shipped by intent.
              </p>

              {/* Decorative stat strip */}
              <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { value: '7', label: 'AI Systems',   color: '#34d399' },
                  { value: '8', label: 'Biome Maps',   color: '#fbbf24' },
                  { value: '7', label: 'Weapons',      color: '#f87171' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-white/[0.07] bg-black/30 py-2.5 text-center backdrop-blur-sm"
                  >
                    <div
                      className="text-2xl font-black tabular-nums"
                      style={{ color: s.color, textShadow: `0 0 14px ${s.color}55` }}
                    >
                      {s.value}
                    </div>
                    <div className="text-[9px] font-semibold tracking-[0.15em] text-gray-500 uppercase mt-0.5">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Portfolio CTA ──────────────────────────────────────────── */}
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
            <span className="relative flex items-center gap-4 w-full rounded-2xl bg-[#0b0f15] px-4 sm:px-5 py-4
              group-hover:bg-[#0d1218] transition-colors">
              <span className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/12 border border-emerald-400/30 flex-shrink-0">
                <ExternalLink className="w-[18px] h-[18px] text-emerald-300" strokeWidth={2} />
                <span
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: '0 0 18px -4px rgba(52,211,153,0.5)' }}
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold tracking-[0.22em] text-emerald-300/90 uppercase mb-0.5">
                  Portfolio
                </span>
                <span className="block text-base font-bold text-white tracking-tight truncate">
                  surya.is-a.dev
                </span>
                <span className="block text-[11px] text-gray-500 truncate">
                  More projects, writing, and ways to get in touch
                </span>
              </span>
              <span className="flex items-center gap-1 text-emerald-300 group-hover:translate-x-0.5 transition-transform">
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase">Visit</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
              </span>
            </span>
          </a>

          {/* ── Tech Stack ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <p className="text-[10px] font-bold tracking-[0.32em] text-gray-400 uppercase">
                Built With
              </p>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    <span className="block text-[10.5px] text-gray-500 truncate">{hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="text-center pt-1">
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
              Crafted with
              <Heart className="w-3.5 h-3.5 text-red-400" strokeWidth={2.25} fill="currentColor" />
              and an obscene number of prompts
            </p>
            <p className="mt-1.5 text-[10px] tracking-[0.3em] text-gray-600 uppercase">
              © 2026 · Forest Survival
            </p>
          </div>

          {/* Back button */}
          <button
            onClick={onClose}
            className="group flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3.5
              border border-white/10 bg-white/[0.03] text-sm font-bold tracking-wide text-gray-300
              transition-all duration-200 hover:text-white hover:bg-white/[0.06] hover:border-white/20 hover:-translate-y-0.5"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.25} />
            Back to Menu
          </button>
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
  );
};

export default CreditsMenu;
