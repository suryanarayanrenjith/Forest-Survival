import { useMemo } from 'react';

type MenuShellVariant = 'main' | 'classic' | 'tutorial' | 'multiplayer';

type MenuShellProps = {
  variant?: MenuShellVariant;
};

type ThemeConfig = {
  accent: string;
  /** Center glow blob behind the menu card */
  centerGlow: string;
  /** Top-down gradient overlay */
  topGlow: string;
  /** Vignette outer color */
  vignette: string;
  /** Edge corner accent color */
  edgeAccent: string;
};

// Per-variant overlays. Since MainMenuForestScene is now hoisted to App
// level and renders the same scene across all menus (to eliminate the
// re-mount lag the user reported), each menu's distinct visual identity
// comes from THIS overlay layer. Each variant uses a clearly different
// hue + gradient pattern so the menus feel like separate spaces:
//
//   • main        — emerald (default brand)
//   • classic     — gold/amber (solo combat warmth)
//   • tutorial    — cyan/teal (educational, calm)
//   • multiplayer — purple/violet (social, energetic)
const THEMES: Record<MenuShellVariant, ThemeConfig> = {
  main: {
    accent: '#34d399',
    centerGlow: 'rgba(52, 211, 153, 0.20)',
    topGlow: 'rgba(52, 211, 153, 0.10)',
    vignette: 'rgba(0, 30, 18, 0.55)',
    edgeAccent: 'rgba(52, 211, 153, 0.16)',
  },
  classic: {
    accent: '#f59e0b',
    centerGlow: 'rgba(245, 158, 11, 0.22)',
    topGlow: 'rgba(245, 158, 11, 0.10)',
    vignette: 'rgba(48, 22, 0, 0.58)',
    edgeAccent: 'rgba(252, 211, 77, 0.18)',
  },
  tutorial: {
    accent: '#22d3ee',
    centerGlow: 'rgba(34, 211, 238, 0.20)',
    topGlow: 'rgba(34, 211, 238, 0.10)',
    vignette: 'rgba(0, 30, 38, 0.58)',
    edgeAccent: 'rgba(34, 211, 238, 0.16)',
  },
  multiplayer: {
    accent: '#a78bfa',
    centerGlow: 'rgba(167, 139, 250, 0.22)',
    topGlow: 'rgba(167, 139, 250, 0.10)',
    vignette: 'rgba(28, 8, 48, 0.58)',
    edgeAccent: 'rgba(216, 180, 254, 0.18)',
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

      {/* Top-down haze — subtle vertical color wash */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${theme.topGlow} 0%, rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.4) 100%)`,
        }}
      />

      {/* Vignette — soft outer darkening tinted with the variant color */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 38%, ${theme.vignette} 100%)`,
        }}
      />

      {/* Diagonal corner accent — gives each menu a unique geometric tint */}
      <div
        className="absolute inset-0 mix-blend-screen opacity-50"
        style={{
          background: `linear-gradient(135deg, ${theme.edgeAccent} 0%, transparent 35%, transparent 65%, ${theme.edgeAccent} 100%)`,
        }}
      />

      {/* Subtle scanlines for cinematic film feel */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}
