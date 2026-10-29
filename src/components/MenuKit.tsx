/**
 * MENU KIT — the shared building blocks of every mode-setup screen (Solo,
 * Tutorial …): back button, screen header, section panel, option card, the
 * atmosphere + map pickers and the fixed start bar. Both screens are now the
 * SAME layout from the same parts; only the mode's accent hue differs (see
 * menuTokens.ts). Before this, Tutorial was a translucent "glass" variant
 * with its own header, buttons and grey type — the two looked like different
 * games side by side.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronDown, CloudSun, Sun, Moon,
  Trees, Flame, Snowflake, Mountain, Droplet, Shield, Leaf, Landmark, type LucideIcon,
} from 'lucide-react';
import { MAP_CONFIGS, type MapType } from '../utils/MapSystem';
import { ACCENTS, MENU_RADIUS, MENU_RADIUS_LG, MENU_SURFACE, MENU_TILE, type MenuAccent } from './menuTokens';

const MAP_ICONS: Record<MapType, LucideIcon> = {
  deep_forest: Trees,
  scorched_wasteland: Flame,
  frozen_tundra: Snowflake,
  desert_canyon: Mountain,
  toxic_swamp: Droplet,
  military_outpost: Shield,
  autumn_grove: Leaf,
  ancient_ruins: Landmark,
};

export type TimeOfDay = 'day' | 'night' | 'auto';

const ATMOSPHERES: { key: TimeOfDay; icon: LucideIcon; label: string; desc: string; color: string }[] = [
  { key: 'auto', icon: CloudSun, label: 'Auto', desc: 'Day-night cycle', color: '#a78bfa' },
  { key: 'day', icon: Sun, label: 'Day', desc: 'Bright', color: '#fbbf24' },
  { key: 'night', icon: Moon, label: 'Night', desc: 'Dark', color: '#818cf8' },
];

/** Fixed top-left Back button (same on every screen). */
export function MenuBackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="group fixed top-5 left-5 z-50 flex items-center gap-2 px-4 py-2.5
        border border-white/[0.12] bg-[#060b09]/85 font-hud text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70
        transition-all duration-200 hover:text-white hover:border-white/30"
      style={{ borderRadius: MENU_RADIUS }}
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2.25} />
      {label}
    </button>
  );
}

const HEADER_SHADOW = '0 1px 2px rgba(0,0,0,0.95), 0 0 12px rgba(3,9,7,0.9)';

/** Eyebrow (mode accent) + brand title + optional subtitle and extra row. */
export function MenuScreenHeader({ eyebrow, title, subtitle, accent, compact, children }: {
  eyebrow: string; title: string; subtitle?: string; accent: MenuAccent; compact?: boolean; children?: React.ReactNode;
}) {
  // The header floats over the BRIGHT sky of the menu forest, so it carries
  // its own soft dark halo + a heavy text shadow — small type stays legible
  // at any time of day without boxing the title in.
  return (
    <div className={`relative text-center ${compact ? 'mb-5' : 'mb-8'}`} style={{ textShadow: HEADER_SHADOW }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-16 -inset-y-6 -z-10"
        style={{ background: 'radial-gradient(ellipse 60% 62% at 50% 52%, rgba(3,9,7,0.62) 0%, rgba(3,9,7,0.28) 55%, transparent 78%)' }}
      />
      <p className={`font-hud text-[10px] tracking-[0.4em] font-semibold uppercase mb-2 ${ACCENTS[accent].text}`}>{eyebrow}</p>
      <h1 className={`font-display title-bio font-semibold uppercase tracking-wide ${compact ? 'text-3xl' : 'text-4xl sm:text-5xl'}`}>
        {title}
      </h1>
      {subtitle && (
        <p className="font-hud mx-auto mt-3 max-w-lg text-[12px] leading-relaxed text-white/85">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

/** A titled panel. `dimmed` greys it out and blocks input (e.g. Random Mode). */
export function MenuSection({ title, accent, dimmed = false, innerRef, children }: {
  title: string; accent: MenuAccent; dimmed?: boolean; innerRef?: React.Ref<HTMLDivElement>; children: React.ReactNode;
}) {
  return (
    <div
      ref={innerRef}
      className={`${MENU_SURFACE} transition-opacity duration-300 ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}
      style={{ borderRadius: MENU_RADIUS }}
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.07]">
        <span className="h-3 w-[2px]" style={{ background: ACCENTS[accent].hex, opacity: 0.85 }} />
        <h2 className="font-hud text-[10px] font-semibold tracking-[0.3em] text-white/70 uppercase">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** A selectable tile inside a section grid. */
export function MenuOptionCard({ active, color, onClick, title, children }: {
  active: boolean; color: string; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative flex flex-col items-center justify-center py-3 px-2 border transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: active ? `${color}aa` : 'rgba(255,255,255,0.08)',
        background: active ? `linear-gradient(180deg, ${color}2e, ${color}10)` : 'rgba(10,16,14,0.9)',
        boxShadow: active ? `inset 0 -2px 0 ${color}` : undefined,
      }}
    >
      {children}
    </button>
  );
}

/** Auto / Day / Night. */
export function AtmosphereSection({ value, onChange, accent, dimmed }: {
  value: TimeOfDay; onChange: (v: TimeOfDay) => void; accent: MenuAccent; dimmed?: boolean;
}) {
  return (
    <MenuSection title="Atmosphere" accent={accent} dimmed={dimmed}>
      <div className="grid grid-cols-3 gap-2">
        {ATMOSPHERES.map((a) => {
          const Icon = a.icon;
          const active = value === a.key;
          return (
            <MenuOptionCard key={a.key} active={active} color={a.color} onClick={() => onChange(a.key)}>
              <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? a.color : '#9ca3af' }} strokeWidth={2} />
              <span className={`font-hud text-xs font-bold ${active ? 'text-white' : 'text-white/75'}`}>{a.label}</span>
              <span className="font-hud text-[10px] text-white/45">{a.desc}</span>
            </MenuOptionCard>
          );
        })}
      </div>
    </MenuSection>
  );
}

/**
 * The map dropdown + 8-map grid. It is the LAST section on a setup screen, so
 * expanding it unfolds the grid under the fixed Start bar (or below the
 * fold) — `scrollRef` (the page scroller) is scrolled to reveal it.
 */
export function MapSection({ value, onChange, accent, dimmed, scrollRef }: {
  value: MapType; onChange: (m: MapType) => void; accent: MenuAccent; dimmed?: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // One frame so the grid has laid out and the section has its final height.
    const raf = requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const section = sectionRef.current;
      if (!scroller || !section) return;
      // Start bar height (pt-10 + button + pb-6) plus breathing room.
      const START_BAR_CLEARANCE = 148;
      const hidden = section.getBoundingClientRect().bottom - (scroller.clientHeight - START_BAR_CLEARANCE);
      if (hidden > 0) scroller.scrollBy({ top: hidden, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, scrollRef]);

  const hex = ACCENTS[accent].hex;
  const SelectedIcon = MAP_ICONS[value];
  return (
    <MenuSection title="Map" accent={accent} dimmed={dimmed} innerRef={sectionRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-3.5 py-3 ${MENU_TILE} transition-colors hover:border-white/25 hover:bg-[#0b1511]`}
      >
        <span className="flex items-center justify-center w-10 h-10 border flex-shrink-0" style={{ borderColor: `${hex}33`, background: `${hex}1f` }}>
          <SelectedIcon className="w-5 h-5" style={{ color: hex }} strokeWidth={1.75} />
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="font-display block text-[15px] font-semibold uppercase tracking-wide text-white truncate">{MAP_CONFIGS[value].name}</span>
          <span className="font-hud block text-[11px] text-white/50 truncate">{MAP_CONFIGS[value].description}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-white/45 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.25} />
      </button>
      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 menu-pop-grid">
          {Object.values(MAP_CONFIGS).map((map) => {
            const Icon = MAP_ICONS[map.id];
            const active = value === map.id;
            return (
              <MenuOptionCard key={map.id} active={active} color={hex} title={map.description}
                onClick={() => { onChange(map.id); setOpen(false); }}>
                <Icon className="w-5 h-5 mb-1.5" style={{ color: active ? hex : '#9ca3af' }} strokeWidth={1.75} />
                <span className={`font-hud text-[10px] font-bold leading-tight text-center ${active ? 'text-white' : 'text-white/60'}`}>
                  {map.name}
                </span>
              </MenuOptionCard>
            );
          })}
        </div>
      )}
    </MenuSection>
  );
}

/**
 * The fixed bottom Start bar. The gradient scrim MUST stay pointer-events-none
 * — it spans the full viewport width, and an interactive scrim swallows every
 * click in the bottom strip (including the Map dropdown once scrolled down).
 * Only the button takes input.
 */
export function MenuStartBar({ onClick, label, icon: Icon, accent, filled = true, iconClassName = 'w-5 h-5' }: {
  onClick: () => void; label: string; icon: LucideIcon; accent: MenuAccent; filled?: boolean; iconClassName?: string;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div
        className="pt-10 pb-6 px-4 flex justify-center"
        style={{ background: `linear-gradient(to top, ${a.scrim}, ${a.scrim}d9 45%, transparent)` }}
      >
        <button
          onClick={onClick}
          className="group font-hud pointer-events-auto flex items-center justify-center gap-2.5 px-12 py-4 min-w-[280px]
            font-bold tracking-[0.22em] uppercase transition-all duration-200
            hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0"
          style={{
            borderRadius: MENU_RADIUS_LG,
            color: a.ctaInk,
            background: `linear-gradient(135deg, ${a.cta[0]}, ${a.cta[1]})`,
            boxShadow: `0 8px 28px -8px ${a.ctaGlow}`,
          }}
        >
          <Icon className={iconClassName} strokeWidth={2.5} fill={filled ? 'currentColor' : 'none'} />
          {label}
        </button>
      </div>
    </div>
  );
}

/** Small caption under the last section. */
export function MenuFootnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-hud mt-6 text-[10px] tracking-[0.3em] text-white/40 uppercase" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
      {children}
    </p>
  );
}
