import {
  Sparkles, Heart, Code2, ExternalLink, X, ArrowLeft,
  Cpu, Wand2, Palette, Boxes, Gamepad2, type LucideIcon,
} from 'lucide-react';

interface CreditsMenuProps {
  onClose: () => void;
}

interface CreditRow {
  label: string;
  icon: LucideIcon;
  accent: string;
}

const TECH_STACK: CreditRow[] = [
  { label: 'React 19 + TypeScript',     icon: Code2,   accent: '#38bdf8' },
  { label: 'Three.js Renderer',         icon: Boxes,   accent: '#34d399' },
  { label: 'pmndrs Postprocessing',     icon: Wand2,   accent: '#c084fc' },
  { label: 'Tailwind + Lucide Icons',   icon: Palette, accent: '#fbbf24' },
  { label: 'PeerJS Multiplayer',        icon: Cpu,     accent: '#f87171' },
];

const CreditsMenu = ({ onClose }: CreditsMenuProps) => {
  const portfolioUrl = 'https://surya.is-a.dev/';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(5,8,10,0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0f15] overflow-hidden"
        style={{ animation: 'crFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Top emerald accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/25">
              <Sparkles className="w-5 h-5 text-emerald-400" strokeWidth={2} fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] tracking-[0.35em] text-emerald-400/90 font-semibold uppercase">
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

        <div className="p-5 sm:p-6 space-y-5">
          {/* Lead — vibe-coded by Surya */}
          <div className="relative rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.03] to-transparent px-5 py-5">
            <div className="flex items-start gap-3 mb-3">
              <Gamepad2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" strokeWidth={2} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-emerald-300/80 uppercase mb-0.5">
                  Vibe-coded by
                </p>
                <h3
                  className="text-3xl sm:text-4xl font-black tracking-tight leading-none"
                  style={{
                    background: 'linear-gradient(180deg, #f0fdf4 0%, #86efac 55%, #22c55e 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 2px 12px rgba(34,197,94,0.35))',
                  }}
                >
                  Surya
                </h3>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-gray-300">
              Conceived, prompted and shipped by Surya — an experiment in vibe coding a
              full AAA-flavoured FPS into existence one prompt at a time. Every system, map,
              menu and shader was specified, refined and polished by direction, not by hand.
            </p>
          </div>

          {/* Portfolio CTA */}
          <a
            href={portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5
              transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500/[0.08] hover:border-emerald-400/45"
          >
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-500/12 border border-emerald-400/20 flex-shrink-0
              group-hover:bg-emerald-500/20 transition-colors">
              <ExternalLink className="w-[18px] h-[18px] text-emerald-300" strokeWidth={2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-white tracking-wide">
                Portfolio · surya.is-a.dev
              </span>
              <span className="block text-[11px] text-gray-500 truncate">
                More projects, writing and ways to get in touch
              </span>
            </span>
            <span className="text-[10px] font-semibold tracking-[0.18em] text-emerald-300/80 uppercase pr-1">
              Visit
            </span>
          </a>

          {/* Tech stack */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-px flex-1 bg-white/[0.07]" />
              <p className="text-[10px] font-semibold tracking-[0.25em] text-gray-500 uppercase">
                Built With
              </p>
              <div className="h-px flex-1 bg-white/[0.07]" />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {TECH_STACK.map(({ label, icon: Icon, accent }) => (
                <li
                  key={label}
                  className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                >
                  <Icon
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: accent }}
                    strokeWidth={2}
                  />
                  <span className="text-xs font-semibold text-gray-300 truncate">{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Made-with footer line */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 pt-1">
            Made with
            <Heart className="w-3.5 h-3.5 text-red-400" strokeWidth={2.25} fill="currentColor" />
            and a lot of prompts
          </div>

          {/* Bottom back button */}
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3
              border border-white/10 bg-white/[0.03] text-sm font-semibold text-gray-300
              transition-colors hover:text-white hover:bg-white/[0.06] hover:border-white/20"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.25} />
            Back
          </button>
        </div>
      </div>

      <style>{`
        @keyframes crFade {
          from { opacity: 0; transform: scale(0.96) translateY(14px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default CreditsMenu;
