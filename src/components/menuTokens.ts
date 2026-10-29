/**
 * MENU DESIGN TOKENS — the one source every menu screen draws from, so Solo,
 * Tutorial, Multiplayer and the modals all read as the same product.
 *
 *   • Shape: partial-rounded (TL + BR) — `MENU_RADIUS` for cards/panels,
 *     `MENU_RADIUS_LG` for primary buttons. (Tailwind's rounded-md…3xl are
 *     overridden to the same family in tailwind.config.js.)
 *   • Surface: an OPAQUE near-black forest panel with a hairline border and a
 *     soft drop shadow — never translucent glass (backdrop-filter also costs a
 *     full-screen blur pass over the 3D backdrop every frame).
 *   • Type: font-display (Oswald) for titles, font-hud (Chakra Petch) for
 *     everything else, on a white-alpha ink scale.
 *   • Accent: each MODE keeps its identity hue (emerald Solo, amber Tutorial,
 *     sky Multiplayer — the same hues as its main-menu tile and MenuShell
 *     grade) on the eyebrow, section spines, active options and the primary
 *     button. Layout, type and surfaces never change between modes.
 */

export type MenuAccent = 'emerald' | 'amber' | 'sky' | 'violet';

export interface AccentSpec {
  /** The accent hue (spines, active borders, icons). */
  hex: string;
  /** Eyebrow / small-label text class. */
  text: string;
  /** Primary-button gradient stops + the dark ink drawn on it. */
  cta: [string, string];
  ctaInk: string;
  /** Glow under the primary button. */
  ctaGlow: string;
  /** Bottom scrim behind the fixed start bar (the mode's tinted floor). */
  scrim: string;
}

export const ACCENTS: Record<MenuAccent, AccentSpec> = {
  emerald: {
    hex: '#34d399', text: 'text-emerald-300/90',
    cta: ['#34d399', '#22c55e'], ctaInk: '#04130a', ctaGlow: 'rgba(52,211,153,0.6)', scrim: '#06130b',
  },
  amber: {
    hex: '#fbbf24', text: 'text-amber-300/90',
    cta: ['#fcd34d', '#f59e0b'], ctaInk: '#160a04', ctaGlow: 'rgba(245,158,11,0.6)', scrim: '#120d05',
  },
  sky: {
    hex: '#38bdf8', text: 'text-sky-300/90',
    cta: ['#7dd3fc', '#38bdf8'], ctaInk: '#04121a', ctaGlow: 'rgba(56,189,248,0.6)', scrim: '#05101a',
  },
  violet: {
    hex: '#a78bfa', text: 'text-violet-300/90',
    cta: ['#a78bfa', '#f0abfc'], ctaInk: '#1a1030', ctaGlow: 'rgba(167,139,250,0.6)', scrim: '#0d0a18',
  },
};

/** Card / panel radius (partial-rounded). */
export const MENU_RADIUS = '10px 2.5px';
/** Primary button radius. */
export const MENU_RADIUS_LG = '14px 3.5px';
/** The opaque panel surface every menu card uses. */
export const MENU_SURFACE = 'border border-white/[0.09] bg-[#060b09]/85 shadow-[0_18px_50px_rgba(0,0,0,0.3)]';
/** An inset tile inside a panel (option cards, rows, inputs). */
export const MENU_TILE = 'border border-white/[0.08] bg-[#0a100e]/90';
