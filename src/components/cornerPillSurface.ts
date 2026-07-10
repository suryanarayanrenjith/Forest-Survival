/**
 * Shared idle surface for the floating corner pills — the "Star on GitHub"
 * CTA (top-right, collapsed state) and the music mute toggle (bottom-right).
 *
 * ONE constant so the two backgrounds can never drift apart: the mute
 * button must always match the GitHub pill's collapsed look exactly.
 * Hover/focus treatments stay per-button — only the resting surface
 * (border, fill, blur, text tone, shadow) is shared.
 */
export const CORNER_PILL_SURFACE =
  'border border-white/15 bg-black/55 backdrop-blur-md text-white/85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]';
