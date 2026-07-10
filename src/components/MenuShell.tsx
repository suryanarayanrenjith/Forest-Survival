import { useMemo } from 'react';

type MenuShellVariant = 'main' | 'classic' | 'tutorial' | 'multiplayer';

type MenuShellProps = {
  variant?: MenuShellVariant;
};

type ThemeConfig = {
  accent: string;
  /** Center glow blob behind the menu card */
  centerGlow: string;
  /** Top-down warm sky-light wash (light only — never darkens) */
  topGlow: string;
  /** Per-variant colour rising from the bottom to tint the App-level
   *  readability anchor with the menu's identity hue (screen-blended,
   *  so it only ADDS light — it must never contribute black). */
  bottomTint: string;
  /** Edge corner accent color */
  edgeAccent: string;
};

// Per-variant overlays. Since MainMenuForestScene is now hoisted to App
// level and renders the same SUNLIT forest across all menus (to eliminate
// the re-mount lag the user reported), each menu's distinct visual identity
// comes from THIS overlay layer — a color grade over the daylight scene.
//
// Hues are aligned with each menu's OWN accent system (the colors already
// used by its cards/buttons and by the MainMenu mode tiles), so the grade
// and the UI read as one design instead of clashing:
//
//   • main        — emerald (brand; open, lightest grade — showcase the vista)
//   • classic     — emerald, deeper vignette (solo mission-prep focus)
//   • tutorial    — amber/gold (matches the amber tutorial UI + start CTA)
//   • multiplayer — sky blue (matches the sky accent on the MP mode tile)
const THEMES: Record<MenuShellVariant, ThemeConfig> = {
  main: {
    accent: '#34d399',
    centerGlow: 'rgba(52, 211, 153, 0.10)',
    topGlow: 'rgba(255, 240, 190, 0.12)',
    bottomTint: 'rgba(52, 211, 153, 0.09)',
    edgeAccent: 'rgba(52, 211, 153, 0.12)',
  },
  classic: {
    accent: '#34d399',
    centerGlow: 'rgba(52, 211, 153, 0.13)',
    topGlow: 'rgba(255, 233, 170, 0.10)',
    bottomTint: 'rgba(110, 231, 183, 0.10)',
    edgeAccent: 'rgba(110, 231, 183, 0.14)',
  },
  tutorial: {
    accent: '#f59e0b',
    centerGlow: 'rgba(245, 158, 11, 0.11)',
    topGlow: 'rgba(255, 214, 130, 0.13)',
    bottomTint: 'rgba(251, 191, 36, 0.10)',
    edgeAccent: 'rgba(252, 211, 77, 0.15)',
  },
  multiplayer: {
    accent: '#38bdf8',
    centerGlow: 'rgba(56, 189, 248, 0.11)',
    topGlow: 'rgba(190, 227, 255, 0.10)',
    bottomTint: 'rgba(56, 189, 248, 0.10)',
    edgeAccent: 'rgba(125, 211, 252, 0.15)',
  },
};

/**
 * Menu chrome overlay. NO 3D scene — the scene is now mounted once at
 * App level via <MenuBackdrop>, persisting across menu navigation so
 * the user doesn't pay a full WebGL re-init cost every time they tap
 * Solo / Tutorial / Multiplayer.
 *
 * This shell provides the per-menu visual identity via stacked CSS
 * gradients (center glow, top-down haze, vignette, corner accents,
 * scanlines). The variants are tuned so each menu feels distinct in
 * its mood even though the underlying 3D backdrop is identical.
 */
export default function MenuShell({ variant = 'main' }: MenuShellProps) {
  const theme = useMemo(() => THEMES[variant], [variant]);

  return (
    <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      {/* Center glow blob — radial gradient pinned to viewport center */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 50% at center, ${theme.centerGlow} 0%, rgba(0,0,0,0) 65%)`,
        }}
      />

      {/* Top-down warm sky-light wash — the canopy daylight spilling in from
          the top, fading to clear air by ~34%. LIGHT ONLY: MenuShell no
          longer darkens the bottom at all. All bottom darkening now lives in
          the single App-level readability anchor, so these overlays can never
          re-stack into the "black bar" the menu used to show at the horizon. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${theme.topGlow} 0%, rgba(0,0,0,0) 34%)`,
        }}
      />

      {/* Per-variant bottom tint — screen-blended so it only ADDS the menu's
          identity hue (emerald / amber / sky) into the App anchor's shade,
          giving each menu a coloured "canopy floor" instead of neutral black.
          Screen blend guarantees it can never contribute darkness. */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: `linear-gradient(to top, ${theme.bottomTint} 0%, rgba(0,0,0,0) 34%)`,
        }}
      />

      {/* Diagonal corner accent — gives each menu a unique geometric tint */}
      <div
        className="absolute inset-0 mix-blend-screen opacity-50"
        style={{
          background: `linear-gradient(135deg, ${theme.edgeAccent} 0%, transparent 35%, transparent 65%, ${theme.edgeAccent} 100%)`,
        }}
      />

      {/* Subtle scanlines for cinematic film feel — dialed down from the
          night build; the bright daylight scene makes them read stronger. */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}
