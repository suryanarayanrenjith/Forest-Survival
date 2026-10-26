import { AnimatePresence, m } from 'motion/react';
import { GRENADE_HUD } from './throwableHud';
import { THROWABLES, THROWABLE_KINDS, type ThrowableKind } from '../utils/Throwables';

/**
 * Throwable quick-select wheel — open while the next-throwable key is HELD.
 * The game keeps running underneath (real-time switching); the mouse picks a
 * segment and releasing the key equips it. Segments run clockwise from the
 * top in THROWABLE_KINDS order — App's steering maths assumes the same.
 *
 * Motion: App renders this inside <AnimatePresence>, so the wheel springs
 * open and fades out on release; segments cascade in around the ring, the
 * hovered one rides a spring, and the centre read-out cross-fades per kind.
 * Transform/opacity only, plain fills (no backdrop blur in-game).
 */
interface ThrowableWheelProps {
  hover: ThrowableKind | null;
  selected: ThrowableKind;
  counts: Record<ThrowableKind, number>;
  /** Tutorial: the pouch never runs out (counts render as ∞). */
  unlimited?: boolean;
  /** Label of the key being held (e.g. 'T'). */
  keyLabel: string;
}

const RADIUS = 132;
const SLOT = 74;
const SLOT_SPRING = { type: 'spring', stiffness: 520, damping: 26 } as const;

const ThrowableWheel = ({ hover, selected, counts, unlimited = false, keyLabel }: ThrowableWheelProps) => {
  const focus = hover ?? selected;
  const spec = THROWABLES[focus];
  const n = THROWABLE_KINDS.length;
  return (
    <m.div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.12 } }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
    >
      {/* Legibility wash (a plain radial gradient). */}
      <div
        className="absolute"
        style={{
          width: RADIUS * 2 + SLOT * 2.2, height: RADIUS * 2 + SLOT * 2.2, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(3,6,6,0.72) 0%, rgba(3,6,6,0.5) 55%, rgba(3,6,6,0) 72%)',
        }}
      />
      <m.div
        className="relative"
        style={{ width: RADIUS * 2 + SLOT, height: RADIUS * 2 + SLOT }}
        initial={{ scale: 0.82, rotate: -12 }}
        animate={{ scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 460, damping: 30 } }}
        exit={{ scale: 0.9, transition: { duration: 0.16 } }}
      >
        {/* Ring guide */}
        <div
          className="absolute rounded-full"
          style={{
            left: SLOT / 2, top: SLOT / 2, width: RADIUS * 2, height: RADIUS * 2,
            border: '1px solid rgba(214,228,220,0.12)',
          }}
        />
        {THROWABLE_KINDS.map((k, i) => {
          const a = (i / n) * Math.PI * 2;
          const x = RADIUS + Math.sin(a) * RADIUS;
          const y = RADIUS - Math.cos(a) * RADIUS;
          const meta = GRENADE_HUD[k];
          const Icon = meta.icon;
          const c = counts[k] ?? 0;
          const isHover = k === hover;
          const isSel = k === selected;
          const empty = c <= 0 && !unlimited;
          return (
            <m.div
              key={k}
              className="absolute flex flex-col items-center justify-center"
              style={{
                left: x, top: y, width: SLOT, height: SLOT,
                borderRadius: '12px 4px',
                background: isHover ? `${meta.color}2e` : 'rgba(5,9,8,0.78)',
                border: `1px solid ${isHover ? meta.color : isSel ? `${meta.color}99` : 'rgba(214,228,220,0.16)'}`,
                transition: 'background-color 0.09s, border-color 0.09s',
              }}
              initial={{ opacity: 0, scale: 0.55 }}
              animate={{
                opacity: empty ? 0.42 : 1,
                scale: isHover ? 1.12 : 1,
                transition: { ...SLOT_SPRING, opacity: { duration: 0.14, delay: i * 0.02 }, scale: { ...SLOT_SPRING, delay: isHover ? 0 : i * 0.02 } },
              }}
            >
              <Icon className="h-6 w-6" style={{ color: empty ? '#5f6a66' : meta.color }} strokeWidth={2.1} />
              <span className="hud-label mt-1" style={{ fontSize: 8.5, letterSpacing: '0.18em', color: isHover ? '#fff' : 'var(--hud-dim)' }}>
                {meta.label}
              </span>
              <span className="hud-num absolute right-1.5 top-1 text-[12px]" style={{ color: empty ? '#ff5a5f' : 'var(--hud-ink)' }}>
                {unlimited ? '∞' : c}
              </span>
              {isSel && (
                <m.span
                  className="absolute -bottom-[3px] left-1/2 -ml-2 h-[2px] w-4"
                  style={{ background: meta.color }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={SLOT_SPRING}
                />
              )}
            </m.div>
          );
        })}
        {/* Centre read-out: what's under the cursor (cross-fades per kind). */}
        <div
          className="absolute flex items-center justify-center text-center"
          style={{ left: RADIUS + SLOT / 2 - 92, top: RADIUS + SLOT / 2 - 54, width: 184, height: 108 }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={focus}
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.14, ease: 'easeOut' } }}
              exit={{ opacity: 0, y: -7, transition: { duration: 0.1 } }}
            >
              <span className="hud-label" style={{ fontSize: 9, letterSpacing: '0.24em', color: spec.lethal ? '#ffb265' : '#39d0e6' }}>
                {spec.lethal ? 'Lethal' : 'Tactical'}
              </span>
              <span className="font-display mt-0.5 text-[22px] uppercase leading-none text-white">{spec.label}</span>
              <span className="mt-1.5 text-[10.5px] leading-snug text-[color:var(--hud-dim)]">{spec.blurb}</span>
              <span className="hud-label mt-2" style={{ fontSize: 8, letterSpacing: '0.2em', color: 'var(--hud-faint)' }}>
                Release {keyLabel} to equip
              </span>
            </m.div>
          </AnimatePresence>
        </div>
      </m.div>
    </m.div>
  );
};

export default ThrowableWheel;
