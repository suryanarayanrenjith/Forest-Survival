import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronsUp, ChevronsDown,
  Wind, Zap, RotateCcw, Sparkles, Radar, Keyboard, Info, Eye, Swords, type LucideIcon,
} from 'lucide-react';
import {
  gameSettingsManager, defaultKeyBindings, normalizeKeyBindings,
  RESERVED_KEY_CODES, type GameAction, type KeyBindings,
} from '../utils/GameSettingsManager';

/** Rebindable actions in display order, with the label + icon shown per row. */
const ACTION_META: { action: GameAction; label: string; icon: LucideIcon }[] = [
  { action: 'moveForward', label: 'Move Forward', icon: ArrowUp },
  { action: 'moveBackward', label: 'Move Backward', icon: ArrowDown },
  { action: 'moveLeft', label: 'Move Left', icon: ArrowLeft },
  { action: 'moveRight', label: 'Move Right', icon: ArrowRight },
  { action: 'jump', label: 'Jump', icon: ChevronsUp },
  { action: 'sprint', label: 'Sprint', icon: Wind },
  { action: 'crouch', label: 'Crouch', icon: ChevronsDown },
  { action: 'dash', label: 'Power-Ups', icon: Zap },
  { action: 'melee', label: 'Melee Strike', icon: Swords },
  { action: 'reload', label: 'Reload', icon: RotateCcw },
  { action: 'usePower', label: 'Use Power-Up', icon: Sparkles },
  { action: 'toggleMap', label: 'Tactical Map', icon: Radar },
  { action: 'inspect', label: 'Inspect Weapon', icon: Eye },
];

const ACTION_LABEL: Record<GameAction, string> =
  Object.fromEntries(ACTION_META.map((m) => [m.action, m.label])) as Record<GameAction, string>;

/** Controls that are intentionally fixed — shown read-only so players know
 *  what they can't (and don't need to) rebind. */
const FIXED_CONTROLS: { keyLabel: string; action: string }[] = [
  { keyLabel: 'Mouse', action: 'Look / Aim' },
  { keyLabel: 'LMB', action: 'Shoot' },
  { keyLabel: 'RMB', action: 'Aim Down Sights' },
  { keyLabel: '1 – 8', action: 'Switch Weapon' },
  { keyLabel: 'Esc', action: 'Pause' },
];

/** Friendly label for a KeyboardEvent.code (e.g. 'KeyW' → 'W', 'Space' → 'Space'). */
function keyCodeLabel(code: string): string {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt',
    MetaLeft: 'L Meta', MetaRight: 'R Meta',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'Caps',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
    Comma: ',', Period: '.', Slash: '/',
  };
  return map[code] ?? code;
}

/** Assign `code` to `action`, swapping with whatever action currently holds it
 *  so no two actions ever share a key and nothing is left unbound. */
function applyRebind(bindings: KeyBindings, action: GameAction, code: string): KeyBindings {
  const next = { ...bindings };
  const previous = next[action];
  (Object.keys(next) as GameAction[]).forEach((a) => {
    if (a !== action && next[a] === code) next[a] = previous;
  });
  next[action] = code;
  return next;
}

interface KeyBindingsEditorProps {
  /** Hex accent for active/listening states (default emerald). */
  accent?: string;
}

/**
 * Interactive keyboard rebinder. Reads/writes the live bindings via
 * gameSettingsManager (which persists to localStorage + syncs to the account),
 * so changes apply to gameplay immediately and survive across devices.
 */
export const KeyBindingsEditor: React.FC<KeyBindingsEditorProps> = ({ accent = '#34d399' }) => {
  const [bindings, setBindings] = useState<KeyBindings>(() => gameSettingsManager.getSetting('keyBindings'));
  const [listening, setListening] = useState<GameAction | null>(null);
  const [notice, setNotice] = useState('');

  // Stay in sync if bindings change elsewhere (e.g. restored from the account).
  useEffect(() => gameSettingsManager.subscribe((s) => setBindings(s.keyBindings)), []);

  const commit = useCallback((next: KeyBindings) => {
    gameSettingsManager.updateSettings({ keyBindings: next });
    setBindings(next);
  }, []);

  // While listening, capture the next key in the capture phase and swallow it
  // so it can't leak to the game (which is listening on document) or the menu.
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const code = e.code;
      if (code === 'Escape') { setListening(null); setNotice(''); return; }
      if (RESERVED_KEY_CODES.has(code)) {
        setNotice(`${keyCodeLabel(code)} is reserved — pick another key`);
        return; // keep listening
      }
      const conflict = (Object.keys(bindings) as GameAction[]).find(
        (a) => a !== listening && bindings[a] === code,
      );
      commit(applyRebind(bindings, listening, code));
      setNotice(conflict ? `Swapped with “${ACTION_LABEL[conflict]}”` : '');
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, bindings, commit]);

  const isDefault = (Object.keys(defaultKeyBindings) as GameAction[]).every(
    (a) => bindings[a] === defaultKeyBindings[a],
  );

  return (
    <div className="space-y-3">
      {/* Hint / live notice */}
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.25} style={{ color: accent }} />
        <span className="text-[11px] text-gray-400">
          {listening
            ? 'Press any key to bind · Esc to cancel'
            : notice || 'Click a key, then press the new key. Conflicts swap automatically.'}
        </span>
      </div>

      {/* Rebindable actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ACTION_META.map(({ action, label, icon: Icon }) => {
          const isListening = listening === action;
          return (
            <div
              key={action}
              className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" strokeWidth={2} />
                <span className="text-sm text-gray-300 font-medium truncate">{label}</span>
              </div>
              <button
                onClick={() => { setListening(isListening ? null : action); setNotice(''); }}
                className="ml-2 min-w-[88px] px-3 py-1.5 rounded-md border font-mono text-[11px] font-semibold tracking-wide transition-all hover:-translate-y-px"
                style={isListening
                  ? { borderColor: accent, color: accent, background: `${accent}1f`, animation: 'kbeListen 1.1s ease-in-out infinite' }
                  : { borderColor: 'rgba(255,255,255,0.12)', color: '#e5e7eb', background: 'rgba(255,255,255,0.06)' }}
                aria-label={`Rebind ${label} (currently ${keyCodeLabel(bindings[action])})`}
              >
                {isListening ? 'Press…' : keyCodeLabel(bindings[action])}
              </button>
            </div>
          );
        })}
      </div>

      {/* Reset */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <Keyboard className="w-3.5 h-3.5" strokeWidth={2} /> Bindings save to your account
        </span>
        <button
          onClick={() => { commit(normalizeKeyBindings(defaultKeyBindings)); setListening(null); setNotice(''); }}
          disabled={isDefault}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-gray-300 transition-colors enabled:hover:bg-white/[0.06] enabled:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.25} /> Reset to defaults
        </button>
      </div>

      {/* Fixed controls reference */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-3.5 py-3">
        <div className="text-[10px] font-semibold tracking-[0.18em] text-gray-500 uppercase mb-2">Fixed controls</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {FIXED_CONTROLS.map((c) => (
            <div key={c.action} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500">{c.action}</span>
              <kbd className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-gray-400 font-mono text-[10px] font-semibold">
                {c.keyLabel}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes kbeListen {
          0%, 100% { box-shadow: 0 0 0 0 ${accent}00; }
          50% { box-shadow: 0 0 12px -1px ${accent}99; }
        }
      `}</style>
    </div>
  );
};

export default KeyBindingsEditor;
