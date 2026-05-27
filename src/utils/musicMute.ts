/**
 * Global background-music mute toggle.
 *
 * Lives outside React so non-component code (the menu-music useEffect,
 * the autoplay unlock handler) can read / subscribe / mutate without
 * dragging in a React import. The button in `components/MusicMuteButton`
 * is just a thin UI wrapper around this module.
 *
 * Persisted to localStorage so the user's choice survives reloads.
 */

const STORAGE_KEY = 'forest_music_muted';

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writePersisted(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Storage unavailable — preference is session-only.
  }
}

const LISTENERS = new Set<(m: boolean) => void>();
let currentMuted = readPersisted();

export const musicMute = {
  get(): boolean { return currentMuted; },
  set(muted: boolean): void {
    if (muted === currentMuted) return;
    currentMuted = muted;
    writePersisted(muted);
    LISTENERS.forEach((cb) => cb(muted));
  },
  toggle(): boolean {
    musicMute.set(!currentMuted);
    return currentMuted;
  },
  subscribe(cb: (m: boolean) => void): () => void {
    LISTENERS.add(cb);
    return () => { LISTENERS.delete(cb); };
  },
};
