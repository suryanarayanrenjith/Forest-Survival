import { lazy, Suspense, useMemo } from 'react';

const LazyForestScene = lazy(() => import('./MainMenuForestScene'));
void import('./MainMenuForestScene');

type MenuShellVariant = 'main' | 'classic' | 'tutorial' | 'multiplayer';

type MenuShellProps = {
  variant?: MenuShellVariant;
};

type ThemeConfig = {
  accent: string;
  glow: string;
  topGlow: string;
};

const THEMES: Record<MenuShellVariant, ThemeConfig> = {
  main: {
    accent: '#34d399',
    glow: 'rgba(52, 211, 153, 0.18)',
    topGlow: 'rgba(52, 211, 153, 0.08)',
  },
  classic: {
    accent: '#34d399',
    glow: 'rgba(52, 211, 153, 0.16)',
    topGlow: 'rgba(52, 211, 153, 0.08)',
  },
  tutorial: {
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.16)',
    topGlow: 'rgba(245, 158, 11, 0.08)',
  },
  multiplayer: {
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.16)',
    topGlow: 'rgba(56, 189, 248, 0.08)',
  },
};

export default function MenuShell({ variant = 'main' }: MenuShellProps) {
  const theme = useMemo(() => THEMES[variant], [variant]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[#05080a]" />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at center, ${theme.glow} 0%, rgba(0,0,0,0) 68%)` }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, ${theme.topGlow} 0%, rgba(0,0,0,0.08) 28%, rgba(0,0,0,0.3) 100%)` }}
      />
      <Suspense fallback={null}>
        <LazyForestScene variant={variant === 'multiplayer' ? 'main' : variant} />
      </Suspense>
    </div>
  );
}