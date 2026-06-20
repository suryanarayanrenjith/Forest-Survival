import {
  Bot, Footprints, ShieldCheck, EyeOff, Flame, HeartPulse, Wrench, Ghost,
  Sparkles, type LucideIcon,
} from 'lucide-react';
import { CLASS_IDS, type ClassId } from '../utils/CharacterModels';
import { CHARACTER_ABILITIES } from '../utils/CharacterAbilityRegistry';
import { CHARACTER_PASSIVES } from '../utils/CharacterPassiveRegistry';
import { ABILITY_ICONS } from './abilityIcons';

/**
 * Solo / Tutorial character picker.
 *
 * Mirrors the multiplayer lobby's character grid: 8 classes, each with a unique
 * silhouette (→ a distinct ground shadow in-game), a signature active ability,
 * and a mild passive. The chosen class is fed to the game loop, which builds the
 * LocalPlayerShadow from it and resolves the active ability + passive from it —
 * the exact same path multiplayer uses, so behaviour is identical across modes.
 */

const ICONS: Record<ClassId, LucideIcon> = {
  ranger: Bot, scout: Footprints, heavy: ShieldCheck, operative: EyeOff,
  pyro: Flame, medic: HeartPulse, engineer: Wrench, phantom: Ghost,
};

const CHARACTER_NAMES: Record<ClassId, string> = {
  ranger: 'Ranger', scout: 'Scout', heavy: 'Heavy', operative: 'Operative',
  pyro: 'Pyro', medic: 'Medic', engineer: 'Engineer', phantom: 'Phantom',
};

interface CharacterSelectProps {
  selected: ClassId;
  onSelect: (id: ClassId) => void;
  /** Theme accent for the section (emerald for Classic, amber for Tutorial). */
  accent?: string;
}

const CharacterSelect = ({ selected, onSelect, accent = '#34d399' }: CharacterSelectProps) => {
  const ability = CHARACTER_ABILITIES[selected];
  const passive = CHARACTER_PASSIVES[selected];
  const AbilityIcon = ABILITY_ICONS[ability.id];

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-4 gap-2">
        {CLASS_IDS.map((id) => {
          const Icon = ICONS[id];
          const ab = CHARACTER_ABILITIES[id];
          const active = selected === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              title={CHARACTER_NAMES[id]}
              className="flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-xl border transition-all duration-200 hover:-translate-y-0.5"
              style={{
                borderColor: active ? `${ab.color}cc` : 'rgba(255,255,255,0.08)',
                background: active ? `${ab.color}24` : 'rgba(255,255,255,0.03)',
              }}
            >
              <Icon className="w-5 h-5" style={{ color: active ? ab.color : '#9ca3af' }} strokeWidth={1.9} />
              <span className={`font-hud text-[10px] font-bold uppercase tracking-wide leading-tight text-center ${active ? 'text-white' : 'text-gray-400'}`}>
                {CHARACTER_NAMES[id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected character detail */}
      <div
        className="rounded-xl border p-3 space-y-2"
        style={{ borderColor: `${ability.color}40`, background: `${ability.color}10` }}
      >
        <div className="flex items-start gap-2.5">
          <span
            className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
            style={{ background: `${ability.color}24` }}
          >
            <AbilityIcon className="w-[18px] h-[18px]" style={{ color: ability.color }} strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <p className="font-hud text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: ability.color }}>
              Ability · {ability.name}
            </p>
            <p className="text-[11px] text-gray-300 leading-snug">{ability.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1.5 border-t border-white/[0.07]">
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accent }} strokeWidth={2} />
          <p className="text-[11px] text-gray-400">
            <span className="font-semibold text-gray-300">{passive.label}:</span> {passive.description}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CharacterSelect;
