'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { throwDice, restingDie, cssMatrix, quatMul, type Quat, type Vec3 } from '@slgh/shared';
import { DieFaces } from './Die3D';
import { sfx } from '@/lib/sound';

/**
 * Dice thrown with real rigid-body physics (see throwDice in @slgh/shared): they fly in, bounce off the
 * felt and the walls, knock into each other, spin and settle. The game still decides the numbers:
 * each throw is simulated first and the dice faces are relabelled so they land showing `values`.
 * The tray is the element's own box; the parent draws the felt (or a board) behind it.
 */
export default function DiceTray({ values, rollKey, size, height, duration = 1.05, tilt = 24, className = '' }: {
  /** What the dice must show */
  values: number[];
  /** Changes for every new throw; null means the dice just sit still */
  rollKey: string | number | null;
  /** Die edge in px */
  size: number;
  /** Tray height in px (its width is the element's width) */
  height: number;
  /** Seconds until the dice settle */
  duration?: number;
  /** Camera tilt in degrees (0 = straight down, for throwing onto a game board) */
  tilt?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dice = useRef<(HTMLDivElement | null)[]>([]);
  const shadows = useRef<(HTMLDivElement | null)[]>([]);
  const [width, setWidth] = useState(0);
  const raf = useRef(0);
  const played = useRef<string | number | null>(null);
  const h = size / 2;

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const place = (i: number, p: Vec3, q: Quat) => {
    const d = dice.current[i], s = shadows.current[i];
    if (d) d.style.transform = cssMatrix(q, [p[0] - h, p[1] - h, p[2]]);
    if (s) {
      const lift = Math.max(0, p[2] - h) / size;
      s.style.transform = `translate3d(${p[0] - h}px, ${p[1] - h}px, 0.5px) scale(${1 + lift * 0.45})`;
      s.style.opacity = String(Math.max(0.12, 0.5 - lift * 0.22));
    }
  };

  // At rest: dice side by side in the middle, each turned a little so it looks hand-placed.
  const rest = () => {
    values.forEach((v, i) => place(i, [width * (i + 1) / (values.length + 1), height / 2, h], restingDie(v, (i % 2 ? -1 : 1) * (0.25 + i * 0.15))));
  };

  useEffect(() => {
    if (!width) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rollKey === null || rollKey === played.current || still) {
      if (rollKey === null || still) {
        if (still && rollKey !== null && rollKey !== played.current) sfx('dice'); // no motion, but still a throw
        cancelAnimationFrame(raf.current); rest(); played.current = rollKey;
      }
      return;
    }
    played.current = rollKey;
    const t = throwDice({ values, size, width, height, seed: hash(String(rollKey)), duration });
    const start = performance.now();
    let nextImpact = 0;
    const tick = (now: number) => {
      // rAF timestamps mark the frame's start, which can be a hair before `start`: never go below frame 0.
      const secs = Math.max(0, (now - start) / 1000);
      const f = Math.min(t.frames.length - 1, Math.floor(secs * 60));
      t.frames[f].forEach((d, i) => place(i, d.p, quatMul(d.q, t.labelTurn[i])));
      while (nextImpact < t.impacts.length && t.impacts[nextImpact].t <= secs) sfx('diceHit', t.impacts[nextImpact++].strength);
      if (f < t.frames.length - 1) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [rollKey, width, height, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // A value shown at rest can change without a throw (e.g. a saved game loads).
  useEffect(() => { if (width && rollKey === null) rest(); }, [values.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className={`dice-physics ${className}`} style={{ height }} aria-label={`Dice showing ${values.join(' and ')}`} role="img">
      <div className="dice-physics-floor" style={{ transform: `rotateX(${tilt}deg)`, height }}>
        {values.map((_, i) => (
          <div key={`s${i}`} ref={(el) => { shadows.current[i] = el; }} className="dice-physics-shadow" style={{ width: size, height: size }} />
        ))}
        {values.map((_, i) => (
          <div key={`d${i}`} ref={(el) => { dice.current[i] = el; }} className="dice-physics-die" style={{ width: size, height: size }}>
            <DieFaces size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** FNV-1a: turns the roll key into a seed, so every viewer of the same throw sees the same tumble */
function hash(s: string) {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  return x >>> 0;
}
