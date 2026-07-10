import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { musicMute } from '../utils/musicMute';
import { CORNER_PILL_SURFACE } from './cornerPillSurface';

interface MusicMuteButtonProps {
  /** Optional class override. Defaults to bottom-right floating pill. */
  className?: string;
}

/**
 * Tiny floating toggle that mutes the background music. Rendered
 * from the screens that need it. The main menu flow mounts it from
 * `App.tsx`, while the skill tree overlay mounts its own copy so the
 * toggle remains available there without leaking into gameplay-wide
 * screens. State + persistence are owned by `utils/musicMute` so
 * non-component code can also react to the toggle.
 */
const MusicMuteButton = ({ className }: MusicMuteButtonProps) => {
  const [muted, setMuted] = useState<boolean>(() => musicMute.get());

  useEffect(() => musicMute.subscribe(setMuted), []);

  // Resting surface comes from CORNER_PILL_SURFACE so this pill always
  // matches the GitHub star pill's collapsed background exactly.
  const baseClass =
    `fixed bottom-4 right-4 z-[60] flex items-center justify-center w-11 h-11 rounded-full ${CORNER_PILL_SURFACE} ` +
    'transition-all duration-200 hover:-translate-y-0.5 hover:text-white hover:border-white/30 hover:bg-black/70 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70';

  return (
    <button
      type="button"
      onClick={() => musicMute.toggle()}
      aria-label={muted ? 'Unmute background music' : 'Mute background music'}
      aria-pressed={muted}
      title={muted ? 'Music is muted — click to unmute' : 'Mute music'}
      className={className ?? baseClass}
    >
      {muted
        ? <VolumeX className="w-[18px] h-[18px]" strokeWidth={2.25} />
        : <Volume2 className="w-[18px] h-[18px]" strokeWidth={2.25} />}
      {muted && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border border-black/40"
        />
      )}
    </button>
  );
};

export default MusicMuteButton;
