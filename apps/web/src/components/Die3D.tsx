import type { CSSProperties } from 'react';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// Cube rotation that brings each face to the front (1 front, 6 back, 2 right, 5 left, 3 top, 4 bottom)
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
const FACE_TF: Record<number, string> = {
  1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 2: 'rotateY(90deg)', 5: 'rotateY(-90deg)', 3: 'rotateX(90deg)', 4: 'rotateX(-90deg)',
};

/** The six red faces of a die with edge `size` px, laid out around the centre (same frame as DIE_FACE_NORMALS). */
export function DieFaces({ size }: { size: number }) {
  const half = size / 2;
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((f) => (
        <div key={f} className="sl-die-face" style={{ transform: `${FACE_TF[f]} translateZ(${half}px)`, padding: size * 0.12, gap: size * 0.04 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="m-auto rounded-full" style={{ width: size * 0.17, height: size * 0.17, background: PIPS[f].includes(i) ? '#fff' : 'transparent' }} />
          ))}
        </div>
      ))}
    </>
  );
}

/** The red 3D dice: tumbles onto `value` when mounted, unless `still` */
export default function Die3D({ value, size, still, delayMs = 0 }: { value: number; size: number; still?: boolean; delayMs?: number }) {
  const [rx, ry] = FACE_ROT[value];
  return (
    <div className="sl-die-scene" style={{ width: size, height: size }}>
      <div className="sl-die" style={{
        '--rx': `${rx}deg`, '--ry': `${ry}deg`, animationDelay: `${delayMs}ms`, ...(still ? { animation: 'none' } : {}),
      } as CSSProperties}>
        <DieFaces size={size} />
      </div>
    </div>
  );
}
