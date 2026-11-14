import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  throwDice, upFace, faceTurn, restingDie, quatMul, rotate, stepSpring, stepParticles, seededRandom, DIE_FACE_NORMALS,
  type Particle,
} from './physics';

/** The value a viewer sees on top: the physical up face, relabelled by the throw's label turn */
const shown = (q: [number, number, number, number], turn: [number, number, number, number]) => upFace(quatMul(q, turn));

describe('dice physics', () => {
  it('every face turn carries one face onto another', () => {
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const n = rotate(faceTurn(a, b), DIE_FACE_NORMALS[a]);
      const want = DIE_FACE_NORMALS[b];
      assert.ok(Math.abs(n[0] - want[0]) + Math.abs(n[1] - want[1]) + Math.abs(n[2] - want[2]) < 1e-9, `${a}->${b}`);
    }
  });

  it('a resting die shows the value asked for', () => {
    for (let v = 1; v <= 6; v++) assert.strictEqual(upFace(restingDie(v, 0.7)), v);
  });

  it('thrown dice land showing exactly the rolled values, flat, inside the tray, on time', () => {
    const rnd = seededRandom(42);
    for (let k = 0; k < 300; k++) {
      const count = 1 + (k % 3);
      const values = Array.from({ length: count }, () => 1 + Math.floor(rnd() * 6));
      const size = 30 + (k % 5) * 12, width = 240 + (k % 4) * 80, height = 140 + (k % 3) * 40;
      const t = throwDice({ values, size, width, height, seed: k + 1, duration: 1.05 });
      const end = t.frames[t.frames.length - 1];
      end.forEach((d, i) => {
        assert.strictEqual(shown(d.q, t.labelTurn[i]), values[i], `throw ${k} die ${i}`);
        const up = rotate(d.q, DIE_FACE_NORMALS[upFace(d.q)]);
        assert.ok(up[2] > 0.999, 'resting flat on a face');
        assert.ok(Math.abs(d.p[2] - size / 2) < 1e-6, 'touching the felt');
        assert.ok(d.p[0] >= size / 2 - 1e-6 && d.p[0] <= width - size / 2 + 1e-6, 'inside the tray (x)');
        assert.ok(d.p[1] >= size / 2 - 1e-6 && d.p[1] <= height - size / 2 + 1e-6, 'inside the tray (y)');
      });
      assert.ok(t.duration <= 1.05 + 10 / 60, `settles in time (${t.duration.toFixed(2)}s)`);
      // Dice really move: they start in the air and travel across the tray.
      const start = t.frames[0][0];
      assert.ok(start.p[2] > size, 'starts in the air');
      const path = t.frames.slice(1).reduce((sum, fr, j) => sum + Math.hypot(fr[0].p[0] - t.frames[j][0].p[0], fr[0].p[1] - t.frames[j][0].p[1]), 0);
      assert.ok(path > width * 0.5, `travels across the tray (${path.toFixed(0)}px)`);
    }
  });

  it('the same seed replays the same throw', () => {
    const a = throwDice({ values: [3, 5], size: 40, width: 300, height: 160, seed: 7 });
    const b = throwDice({ values: [3, 5], size: 40, width: 300, height: 160, seed: 7 });
    assert.deepStrictEqual(a.frames[a.frames.length - 1], b.frames[b.frames.length - 1]);
  });

  it('records impacts for the clatter sound', () => {
    const t = throwDice({ values: [6, 6], size: 60, width: 320, height: 180, seed: 3 });
    assert.ok(t.impacts.length > 0);
    assert.ok(t.impacts.every((i) => i.strength > 0 && i.strength <= 1 && i.t >= 0));
  });
});

describe('springs and particles', () => {
  it('a spring overshoots a little and comes to rest on its target', () => {
    const s = { x: 0, v: 0 };
    let max = 0, frames = 0;
    while (!stepSpring(s, 100, 1 / 60) && frames < 600) { max = Math.max(max, s.x); frames++; }
    assert.strictEqual(s.x, 100);
    assert.ok(max > 100 && max < 115, `overshoot ${max}`);
    assert.ok(frames < 120, 'settles within two seconds');
  });

  it('springs give the same result at 30 and 120 frames per second', () => {
    const a = { x: 0, v: 0 }, b = { x: 0, v: 0 };
    for (let i = 0; i < 15; i++) stepSpring(a, 50, 1 / 30);
    for (let i = 0; i < 60; i++) stepSpring(b, 50, 1 / 120);
    assert.ok(Math.abs(a.x - b.x) < 0.5);
  });

  it('coins fall, bounce on the floor and stop', () => {
    const coin: Particle = { x: 0, y: 0, vx: 50, vy: -400, rot: 0, vrot: 0, flip: 0, vflip: 10, size: 10, color: '#fc0', kind: 'coin', life: 5, floor: 200, bounces: 0 };
    let bounces = 0;
    for (let i = 0; i < 300; i++) bounces += stepParticles([coin], 1 / 60);
    assert.ok(bounces >= 2, `bounced ${bounces} times`);
    assert.strictEqual(coin.y, 200);
    assert.strictEqual(coin.vy, 0);
  });
});
