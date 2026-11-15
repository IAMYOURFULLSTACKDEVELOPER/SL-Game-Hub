'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { SnakeState, SnakeMove } from '@slgh/shared';

// The Snake board and its controls, shared by solo Snake and the online race.
// The board is drawn on a canvas so the snake can glide smoothly between squares and look solid:
// a tilted table-top board, a shaded snake with a shadow under it, and a glossy apple that bobs.

const KEYS: Record<string, SnakeMove> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

/** Arrow keys / WASD steer; `turn` returns true when it used the key. */
export function useSnakeKeys(turn: (move: SnakeMove) => boolean) {
  const ref = useRef(turn);
  ref.current = turn;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const move = KEYS[e.key];
      if (move && ref.current(move)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// ---- Speed ------------------------------------------------------------------------------------------------

/** Milliseconds per step for speed levels 1 (slowest) to 10 (fastest). */
export const SNAKE_SPEEDS = [300, 250, 210, 180, 150, 125, 105, 90, 75, 60] as const;
export const DEFAULT_SNAKE_LEVEL = 5;
const SPEED_KEY = 'slgh-snake-speed';

export const msForLevel = (level: number) => SNAKE_SPEEDS[Math.min(SNAKE_SPEEDS.length, Math.max(1, Math.round(level))) - 1];

export function loadSnakeLevel(): number {
  try {
    const n = Number(localStorage.getItem(SPEED_KEY));
    return n >= 1 && n <= SNAKE_SPEEDS.length ? Math.round(n) : DEFAULT_SNAKE_LEVEL;
  } catch { return DEFAULT_SNAKE_LEVEL; }
}

export function saveSnakeLevel(level: number) {
  try { localStorage.setItem(SPEED_KEY, String(level)); } catch { /* private mode */ }
}

const SPEED_NAMES = ['Crawl', 'Very slow', 'Slow', 'Easy', 'Normal', 'Brisk', 'Quick', 'Fast', 'Very fast', 'Lightning'];

/** Slider from slow to fast. Changes take effect on the next step, even mid-game. */
export function SnakeSpeed({ level, onChange }: { level: number; onChange: (level: number) => void }) {
  const pct = ((level - 1) / (SNAKE_SPEEDS.length - 1)) * 100;
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-sm font-semibold">
        <span>Speed</span>
        <span className="chip chip-muted">{SPEED_NAMES[level - 1]} · {level}/{SNAKE_SPEEDS.length}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="text-xs font-semibold text-muted">Slow</span>
        <input
          type="range" min={1} max={SNAKE_SPEEDS.length} step={1} value={level}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${SPEED_NAMES[level - 1]}, level ${level} of ${SNAKE_SPEEDS.length}`}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-[rgb(var(--c-primary))]"
          style={{ background: `linear-gradient(to right, rgb(var(--c-primary)) ${pct}%, rgb(var(--c-border)) ${pct}%)` }}
        />
        <span className="text-xs font-semibold text-muted">Fast</span>
      </span>
    </label>
  );
}

// ---- Drawing ----------------------------------------------------------------------------------------------

type Pt = { x: number; y: number };
interface Live { state: SnakeState; prev: number[]; at: number; bursts: { x: number; y: number; at: number }[] }

const TILE_A = '#1f2b47', TILE_B = '#24324f';
const DIRS: Record<SnakeMove, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

function drawTiles(n: number, size: number): HTMLCanvasElement {
  const bg = document.createElement('canvas');
  bg.width = bg.height = size;
  const g = bg.getContext('2d')!;
  const c = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x * c, py = y * c;
      g.fillStyle = (x + y) % 2 ? TILE_A : TILE_B;
      g.fillRect(px, py, c, c);
      // bevel: light along the top and left edges, shade along the bottom and right
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(px, py, c, c * 0.08);
      g.fillRect(px, py, c * 0.08, c);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(px, py + c * 0.92, c, c * 0.08);
      g.fillRect(px + c * 0.92, py, c * 0.08, c);
    }
  }
  // soft light from the top-left, darker toward the far corner
  const light = g.createRadialGradient(size * 0.25, size * 0.2, size * 0.05, size * 0.5, size * 0.5, size * 0.85);
  light.addColorStop(0, 'rgba(255,255,255,0.07)');
  light.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = light;
  g.fillRect(0, 0, size, size);
  return bg;
}

/** Strokes a path through the points and a disc on each, so short and long snakes both look round. */
function tube(g: CanvasRenderingContext2D, pts: Pt[], width: number, style: string, dx = 0, dy = 0) {
  g.strokeStyle = style; g.fillStyle = style; g.lineWidth = width;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy)));
  if (pts.length > 1) g.stroke();
  for (const p of pts) { g.beginPath(); g.arc(p.x + dx, p.y + dy, width / 2, 0, Math.PI * 2); g.fill(); }
}

function drawApple(g: CanvasRenderingContext2D, cx: number, cy: number, c: number, lift: number) {
  // shadow shrinks as the apple rises
  g.fillStyle = `rgba(0,0,0,${0.4 - lift * 1.2})`;
  g.beginPath(); g.ellipse(cx + c * 0.06, cy + c * 0.3, c * (0.3 - lift * 0.6), c * (0.12 - lift * 0.25), 0, 0, Math.PI * 2); g.fill();
  const r = c * 0.36, ay = cy - c * 0.08 - lift * c;
  g.save();
  g.shadowColor = 'rgba(239,68,68,0.6)'; g.shadowBlur = c * 0.5;
  const body = g.createRadialGradient(cx - r * 0.35, ay - r * 0.4, r * 0.1, cx, ay, r);
  body.addColorStop(0, '#fecaca'); body.addColorStop(0.35, '#ef4444'); body.addColorStop(1, '#7f1d1d');
  g.fillStyle = body;
  g.beginPath(); g.arc(cx, ay, r, 0, Math.PI * 2); g.fill();
  g.restore();
  // stem and leaf
  g.strokeStyle = '#78350f'; g.lineWidth = c * 0.07; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, ay - r * 0.8); g.lineTo(cx + r * 0.12, ay - r * 1.25); g.stroke();
  g.fillStyle = '#4ade80';
  g.beginPath(); g.ellipse(cx + r * 0.42, ay - r * 1.05, r * 0.32, r * 0.15, -0.5, 0, Math.PI * 2); g.fill();
  // gloss
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.ellipse(cx - r * 0.38, ay - r * 0.38, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2); g.fill();
}

function drawSnake(g: CanvasRenderingContext2D, pts: Pt[], c: number, dir: Pt, dead: boolean, now: number) {
  if (!pts.length) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const head = pts[0];
  // shadow on the board
  tube(g, pts, c * 0.74, 'rgba(0,0,0,0.38)', c * 0.1, c * 0.2);
  // body: dark base, lighter top, a thin shine along the back
  tube(g, pts, c * 0.78, dead ? '#7f1d1d' : '#14532d');
  tube(g, pts, c * 0.64, dead ? '#b91c1c' : '#16a34a');
  tube(g, pts, c * 0.44, dead ? '#ef4444' : '#22c55e', -c * 0.04, -c * 0.07);
  // scales: a soft mark on every other segment
  g.fillStyle = 'rgba(20,83,45,0.35)';
  for (let i = 2; i < pts.length; i += 2) { g.beginPath(); g.arc(pts[i].x, pts[i].y, c * 0.12, 0, Math.PI * 2); g.fill(); }
  tube(g, pts, c * 0.12, 'rgba(255,255,255,0.32)', -c * 0.1, -c * 0.16);

  // head
  const hr = c * 0.46;
  const hg = g.createRadialGradient(head.x - hr * 0.35, head.y - hr * 0.45, hr * 0.1, head.x, head.y, hr);
  hg.addColorStop(0, dead ? '#fecaca' : '#bbf7d0'); hg.addColorStop(0.45, dead ? '#ef4444' : '#22c55e'); hg.addColorStop(1, dead ? '#7f1d1d' : '#14532d');
  g.fillStyle = hg;
  g.beginPath(); g.arc(head.x, head.y, hr, 0, Math.PI * 2); g.fill();

  const side = { x: -dir.y, y: dir.x };
  // tongue flicks out now and then
  if (!dead && now % 1400 < 220) {
    const tx = head.x + dir.x * hr, ty = head.y + dir.y * hr, len = c * 0.35;
    g.strokeStyle = '#f43f5e'; g.lineWidth = c * 0.06;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + dir.x * len, ty + dir.y * len);
    g.lineTo(tx + dir.x * len * 1.3 + side.x * len * 0.3, ty + dir.y * len * 1.3 + side.y * len * 0.3);
    g.moveTo(tx + dir.x * len, ty + dir.y * len);
    g.lineTo(tx + dir.x * len * 1.3 - side.x * len * 0.3, ty + dir.y * len * 1.3 - side.y * len * 0.3);
    g.stroke();
  }
  // eyes look the way the snake is going
  for (const s of [1, -1]) {
    const ex = head.x + dir.x * c * 0.14 + side.x * s * c * 0.2, ey = head.y + dir.y * c * 0.14 + side.y * s * c * 0.2;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(ex, ey, c * 0.13, 0, Math.PI * 2); g.fill();
    if (dead) {
      g.strokeStyle = '#111'; g.lineWidth = c * 0.05; const k = c * 0.07;
      g.beginPath(); g.moveTo(ex - k, ey - k); g.lineTo(ex + k, ey + k); g.moveTo(ex + k, ey - k); g.lineTo(ex - k, ey + k); g.stroke();
    } else {
      g.fillStyle = '#0f172a';
      g.beginPath(); g.arc(ex + dir.x * c * 0.05, ey + dir.y * c * 0.05, c * 0.065, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex + dir.x * c * 0.02 - c * 0.02, ey + dir.y * c * 0.02 - c * 0.03, c * 0.025, 0, Math.PI * 2); g.fill();
    }
  }
}

/** Scales to the screen; swipe on it to steer */
export function SnakeBoard({ state, onTurn, children }: { state: SnakeState; onTurn: (move: SnakeMove) => void; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<Live>({ state, prev: state.snake, at: 0, bursts: [] });
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // Remember where the snake was, so each step can be drawn as a glide from there
  useEffect(() => {
    const L = live.current;
    if (state.snake !== L.state.snake) {
      L.prev = L.state.snake;
      L.at = performance.now();
      if (state.score > L.state.score) {
        const n = state.boardSize;
        L.bursts.push({ x: state.snake[0] % n, y: Math.floor(state.snake[0] / n), at: L.at });
      }
    }
    L.state = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let bg: HTMLCanvasElement | null = null, bgKey = '';
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = live.current, s = L.state, n = s.boardSize;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.round(canvas.clientWidth * dpr);
      if (!size) return;
      if (canvas.width !== size) canvas.width = canvas.height = size;
      if (bgKey !== `${n}:${size}`) { bg = drawTiles(n, size); bgKey = `${n}:${size}`; }
      const c = size / n;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bg!, 0, 0);

      // food
      const fx = (s.food % n + 0.5) * c, fy = (Math.floor(s.food / n) + 0.5) * c;
      drawApple(g, fx, fy, c, still ? 0.05 : 0.05 + 0.05 * Math.sin(now / 260));

      // the snake glides from its last squares to the new ones over one step
      const dead = s.status !== 'playing';
      const t = dead || still ? 1 : Math.min(1, (now - L.at) / Math.max(40, s.speed));
      const pts = s.snake.map((cell, i) => {
        const cx = cell % n, cy = Math.floor(cell / n);
        const from = L.prev[i] ?? L.prev[L.prev.length - 1] ?? cell;
        let px = from % n, py = Math.floor(from / n);
        if (Math.abs(px - cx) + Math.abs(py - cy) > 1) { px = cx; py = cy; } // restarted or loaded: no glide
        return { x: (px + (cx - px) * t + 0.5) * c, y: (py + (cy - py) * t + 0.5) * c };
      });
      drawSnake(g, pts, c, DIRS[s.direction], dead, now);

      // +10 where food was eaten
      L.bursts = L.bursts.filter((b) => now - b.at < 600);
      for (const b of L.bursts) {
        const k = (now - b.at) / 600, bx = (b.x + 0.5) * c, by = (b.y + 0.5) * c;
        g.strokeStyle = `rgba(250,204,21,${1 - k})`; g.lineWidth = c * 0.12 * (1 - k);
        g.beginPath(); g.arc(bx, by, c * (0.4 + k * 1.1), 0, Math.PI * 2); g.stroke();
        g.fillStyle = `rgba(254,240,138,${1 - k})`;
        g.font = `bold ${Math.round(c * 0.8)}px system-ui, sans-serif`; g.textAlign = 'center';
        g.fillText('+10', bx, by - c * (0.6 + k * 1.2));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onSwipeEnd = (e: React.PointerEvent) => {
    const start = swipe.current; swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    onTurn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  return (
    <div
      className="mx-auto w-full max-w-[480px] select-none pb-4 pt-1"
      style={{ perspective: '1100px', touchAction: 'none' }}
      onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={onSwipeEnd}
      onPointerCancel={() => { swipe.current = null; }}
    >
      {/* the board is a slab tilted away from you, with a thick edge and a shadow on the table */}
      <div
        className="relative rounded-2xl p-2"
        style={{
          transform: 'rotateX(14deg)', transformOrigin: '50% 100%',
          background: 'linear-gradient(160deg, #3b4a6b, #1b2440 60%, #141a2e)',
          boxShadow: '0 3px 0 #2b3654, 0 12px 0 #0e1424, 0 26px 32px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.4)',
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Snake board: ${state.snake.length} long, score ${state.score}${state.status !== 'playing' ? ', crashed' : ''}`}
          className="block aspect-square w-full rounded-xl"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)' }}
        />
        {children && <div className="pointer-events-none absolute inset-2 overflow-hidden rounded-xl [&>*]:pointer-events-auto">{children}</div>}
      </div>
    </div>
  );
}

/** On-screen arrows for touch screens */
export function SnakePad({ onTurn }: { onTurn: (move: SnakeMove) => void }) {
  const pad = (move: SnakeMove, label: string, d: string, area: string) => (
    <button type="button" aria-label={label} onClick={() => onTurn(move)} style={{ gridArea: area }}
      className="btn btn-outline h-14 min-h-0 w-14 rounded-2xl p-0 shadow-[0_4px_0_rgb(var(--c-border))] active:translate-y-1 active:shadow-none">
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  );
  return (
    <div className="touch-only mx-auto grid w-fit gap-2" style={{ gridTemplateAreas: '". up ." "left . right" ". down ."' }}>
      {pad('up', 'Up', 'm6 15 6-6 6 6', 'up')}
      {pad('left', 'Left', 'm15 6-6 6 6 6', 'left')}
      {pad('right', 'Right', 'm9 6 6 6-6 6', 'right')}
      {pad('down', 'Down', 'm6 9 6 6 6-6', 'down')}
    </div>
  );
}
