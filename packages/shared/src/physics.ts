// Small, dependency-free physics for game feel: rigid-body dice, springs and particles.
// Kept tiny on purpose (no WebGL or physics library) so it runs on low-end phones.
//
// Coordinates match CSS 3D: x right, y down (across the tray floor), z up out of the floor
// (towards the viewer). Units are pixels and seconds.

export type Vec3 = [number, number, number];
/** Quaternion [w, x, y, z] */
export type Quat = [number, number, number, number];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
const normQ = (q: Quat): Quat => { const n = Math.hypot(...q) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
export const quatAxisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2), n = len(axis) || 1;
  return [Math.cos(angle / 2), (axis[0] / n) * s, (axis[1] / n) * s, (axis[2] / n) * s];
};
/** Rotate a vector by a quaternion */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [q[1], q[2], q[3]];
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, q[0])), cross(u, t));
}
/** Column-major CSS matrix3d values for rotation `q` then translation `t` */
export function cssMatrix(q: Quat, t: Vec3): string {
  const [w, x, y, z] = q;
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0,
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0,
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1,
  ];
  return `matrix3d(${m.map((n) => +n.toFixed(5)).join(',')})`;
}

/** Seeded random numbers, so a given throw always plays out the same way */
export function seededRandom(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Dice                                                                */
/* ------------------------------------------------------------------ */

/** Outward normal of each face in the die's own frame (opposite faces add up to 7). Matches Die3D. */
export const DIE_FACE_NORMALS: Record<number, Vec3> = {
  1: [0, 0, 1], 6: [0, 0, -1], 2: [1, 0, 0], 5: [-1, 0, 0], 3: [0, -1, 0], 4: [0, 1, 0],
};
const CORNERS: Vec3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as Vec3)));

export interface DieFrame { p: Vec3; q: Quat }
export interface DiceThrow {
  /** frames[f][die] at 60 frames per second */
  frames: DieFrame[][];
  /** Extra rotation (in the die's own frame) so each die lands showing the value asked for */
  labelTurn: Quat[];
  /** Moments a die hits the felt or a wall hard enough to hear, with a 0..1 strength */
  impacts: { t: number; strength: number }[];
  duration: number;
}

/** Which face (1-6, in the die's own frame) points up for orientation q */
export function upFace(q: Quat): number {
  let best = 1, bestZ = -Infinity;
  for (const f of [1, 2, 3, 4, 5, 6]) {
    const z = rotate(q, DIE_FACE_NORMALS[f])[2];
    if (z > bestZ) { bestZ = z; best = f; }
  }
  return best;
}

/** The quarter or half turn (die frame) that carries face `from` onto the direction of face `to` */
export function faceTurn(from: number, to: number): Quat {
  const a = DIE_FACE_NORMALS[from], b = DIE_FACE_NORMALS[to];
  if (from === to) return [1, 0, 0, 0];
  if (from + to === 7) {
    const axis: Vec3 = Math.abs(a[0]) < 0.5 ? [1, 0, 0] : [0, 1, 0];
    return quatAxisAngle(axis, Math.PI);
  }
  return quatAxisAngle(cross(a, b), Math.PI / 2);
}

/**
 * Throw `values.length` dice across a tray `width` × `height` px with die edge `size` px.
 * Real rigid-body motion (gravity, bounces, friction, spin, dice knocking each other), then each die's
 * face labels are turned so the face that physically lands on top shows the value the game rolled.
 * Everything settles by `duration` seconds.
 */
export function throwDice(opts: { values: number[]; size: number; width: number; height: number; seed: number; duration?: number }): DiceThrow {
  const { values, size, width: W, height: H } = opts;
  const duration = opts.duration ?? 1.05;
  const rnd = seededRandom(opts.seed);
  const h = size / 2;
  const g = size * 70;               // exaggerated gravity reads better than real gravity at this scale
  const invI = 3 / (2 * h * h);      // solid cube, mass 1
  const radius = h * 1.2;            // dice collide with each other as spheres (simple colliders)
  const n = values.length;
  const fromLeft = rnd() < 0.5;

  const bodies = values.map((_, i) => {
    const lane = (i + 0.5) / n;
    const p: Vec3 = [fromLeft ? h * 1.3 + rnd() * W * 0.12 : W - h * 1.3 - rnd() * W * 0.12, H * (0.25 + 0.5 * lane) + (rnd() - 0.5) * h, h + size * (1 + rnd() * 1.2)];
    const speed = W * (2.2 + rnd() * 0.7);
    const v: Vec3 = [fromLeft ? speed : -speed, (rnd() - 0.5) * H * 1.2, size * (2 + rnd() * 3)];
    const q = normQ(quatAxisAngle([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], rnd() * Math.PI * 2));
    const w: Vec3 = [(rnd() - 0.5) * 50, (rnd() - 0.5) * 50, (rnd() - 0.5) * 30];
    return { p, v, q, w, lastHit: -1 };
  });

  // Floor plus four walls: inside when dot(point, n) >= d
  const planes: { n: Vec3; d: number; e: number; mu: number; floor: boolean }[] = [
    { n: [0, 0, 1], d: 0, e: 0.38, mu: 0.42, floor: true },
    { n: [1, 0, 0], d: 0, e: 0.5, mu: 0.2, floor: false },
    { n: [-1, 0, 0], d: -W, e: 0.5, mu: 0.2, floor: false },
    { n: [0, 1, 0], d: 0, e: 0.5, mu: 0.2, floor: false },
    { n: [0, -1, 0], d: -H, e: 0.5, mu: 0.2, floor: false },
  ];

  const dt = 1 / 240;
  const steps = Math.round(duration / dt);
  const frames: DieFrame[][] = [];
  const impacts: DiceThrow['impacts'] = [];
  const settleFrom = duration - 0.4;

  for (let s = 0; s <= steps; s++) {
    const t = s * dt;
    for (const b of bodies) {
      // integrate
      b.v[2] -= g * dt;
      b.p = add(b.p, mul(b.v, dt));
      const wq: Quat = [0, b.w[0], b.w[1], b.w[2]];
      const dq = quatMul(wq, b.q);
      b.q = normQ([b.q[0] + 0.5 * dq[0] * dt, b.q[1] + 0.5 * dq[1] * dt, b.q[2] + 0.5 * dq[2] * dt, b.q[3] + 0.5 * dq[3] * dt]);

      // contacts with the felt and the walls, corner by corner
      let touching = false;
      for (const pl of planes) {
        const hits: Vec3[] = [];
        let deepest = 0;
        for (const c of CORNERS) {
          const r = rotate(b.q, mul(c, h));
          const pen = pl.d - dot(add(b.p, r), pl.n);
          if (pen > 0) { hits.push(r); deepest = Math.max(deepest, pen); }
        }
        if (!hits.length) continue;
        if (pl.floor) touching = true;
        for (const r of hits) {
          const vc = add(b.v, cross(b.w, r));
          const vn = dot(vc, pl.n);
          if (vn >= 0) continue;
          if (vn < -size * 3 && t - b.lastHit > 0.06) { impacts.push({ t, strength: Math.min(1, -vn / (size * 14)) }); b.lastHit = t; }
          const rn = cross(r, pl.n);
          const jn = (-(1 + pl.e) * vn) / (1 + invI * dot(rn, rn)) / hits.length;
          b.v = add(b.v, mul(pl.n, jn));
          b.w = add(b.w, mul(cross(r, pl.n), jn * invI));
          // friction
          const vt = sub(vc, mul(pl.n, vn));
          const vtl = len(vt);
          if (vtl > 1e-3) {
            const tn = mul(vt, 1 / vtl);
            const rt = cross(r, tn);
            const jt = -Math.min(vtl / (1 + invI * dot(rt, rt)), pl.mu * jn);
            b.v = add(b.v, mul(tn, jt));
            b.w = add(b.w, mul(cross(r, tn), jt * invI));
          }
        }
        b.p = add(b.p, mul(pl.n, deepest));
      }

      // air and rolling resistance; then a firm hand at the end so the throw always settles in time
      const late = t > settleFrom ? (t - settleFrom) / (duration - settleFrom) : 0;
      const lin = 1 - Math.min(0.9, (0.2 + (touching ? 1.2 : 0) + late * 14) * dt);
      const ang = 1 - Math.min(0.9, (0.4 + (touching ? 3 : 0) + late * 16) * dt);
      b.v = mul(b.v, lin);
      b.w = mul(b.w, ang);
    }

    // dice knock into each other
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = bodies[i], B = bodies[j];
      const d = sub(A.p, B.p);
      const dist = len(d) || 1e-6;
      if (dist >= 2 * radius) continue;
      const nrm = mul(d, 1 / dist);
      const push = (2 * radius - dist) / 2;
      A.p = add(A.p, mul(nrm, push)); B.p = sub(B.p, mul(nrm, push));
      const vrel = dot(sub(A.v, B.v), nrm);
      if (vrel < 0) {
        const j2 = (-(1 + 0.45) * vrel) / 2;
        A.v = add(A.v, mul(nrm, j2)); B.v = sub(B.v, mul(nrm, j2));
        const spin = mul(cross(nrm, [0, 0, 1]), j2 * invI * h * 0.6);
        A.w = add(A.w, spin); B.w = sub(B.w, spin);
        if (-vrel > size * 3) impacts.push({ t, strength: Math.min(1, -vrel / (size * 14)) });
      }
    }

    if (s % 4 === 0) frames.push(bodies.map((b) => ({ p: [...b.p] as Vec3, q: [...b.q] as Quat })));
  }

  // Ease the last few frames onto an exact resting pose (flat on a face, touching the felt).
  const ease = 8;
  const rest = bodies.map((b) => {
    const f = upFace(b.q);
    const up = rotate(b.q, DIE_FACE_NORMALS[f]);
    const axis = cross(up, [0, 0, 1]);
    const ang = Math.acos(Math.max(-1, Math.min(1, up[2])));
    const q = len(axis) > 1e-6 ? normQ(quatMul(quatAxisAngle(axis, ang), b.q)) : b.q;
    return { p: [Math.max(h, Math.min(W - h, b.p[0])), Math.max(h, Math.min(H - h, b.p[1])), h] as Vec3, q };
  });
  const last = frames[frames.length - 1];
  for (let k = 1; k <= ease; k++) {
    const a = k / ease;
    frames.push(last.map((fr, i) => ({ p: add(mul(fr.p, 1 - a), mul(rest[i].p, a)), q: nlerp(fr.q, rest[i].q, a) })));
  }

  const labelTurn = rest.map((r, i) => faceTurn(values[i], upFace(r.q)));
  return { frames, labelTurn, impacts, duration: frames.length / 60 };
}

function nlerp(a: Quat, b: Quat, t: number): Quat {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return normQ([a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t]);
}

/** A die at rest showing `value`, turned `yaw` radians about the vertical */
export function restingDie(value: number, yaw = 0): Quat {
  return quatMul(quatAxisAngle([0, 0, 1], yaw), faceTurn(value, 1));
}

/* ------------------------------------------------------------------ */
/* Springs                                                             */
/* ------------------------------------------------------------------ */

export interface Spring { x: number; v: number }
/**
 * Advance a damped spring towards `target` by `dt` seconds (sub-stepped, so frame-rate independent).
 * Returns true once it has come to rest.
 */
export function stepSpring(s: Spring, target: number, dt: number, stiffness = 170, damping = 18): boolean {
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -stiffness * (s.x - target) - damping * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x - target) < 0.05 && Math.abs(s.v) < 0.5) { s.x = target; s.v = 0; return true; }
  return false;
}

/* ------------------------------------------------------------------ */
/* Particles (confetti, coins)                                          */
/* ------------------------------------------------------------------ */

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  rot: number; vrot: number; flip: number; vflip: number;
  size: number; color: string; kind: 'confetti' | 'coin';
  life: number; floor?: number; bounces: number;
}

/** Advance particles by dt. Confetti flutters (drag + sway); coins fall, bounce and roll to a stop. Returns bounce count. */
export function stepParticles(ps: Particle[], dt: number, gravity = 1400): number {
  let bounces = 0;
  for (const p of ps) {
    p.life -= dt;
    if (p.kind === 'confetti') {
      p.vy += gravity * 0.55 * dt;
      const drag = 1 - Math.min(0.9, 2.2 * dt);
      p.vx *= drag; p.vy *= drag;
      p.vx += Math.sin(p.flip) * 40 * dt; // paper sways as it tumbles
    } else {
      p.vy += gravity * dt;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vrot * dt; p.flip += p.vflip * dt;
    if (p.floor !== undefined && p.y > p.floor) {
      p.y = p.floor;
      if (p.vy > 80) { p.vy = -p.vy * 0.45; bounces++; p.bounces++; } else p.vy = 0;
      p.vx *= 0.8; p.vflip *= 0.85;
    }
  }
  return bounces;
}
