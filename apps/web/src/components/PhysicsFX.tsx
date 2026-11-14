'use client';
import { useEffect, useRef, useState } from 'react';
import { stepParticles, type Particle } from '@slgh/shared';
import { FX_EVENT, type FxEvent } from '@/lib/celebrate';
import { sfx } from '@/lib/sound';

const CONFETTI = ['#1EB53A', '#ffffff', '#0072C6', '#FCC440', '#e5383b', '#7cc4e8'];
const between = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Confetti and coins with real particle physics (gravity, air drag, flutter, bouncing).
 * The canvas only exists while something is flying, so it costs nothing the rest of the time.
 */
export function PhysicsFX() {
  const [active, setActive] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);

  useEffect(() => {
    const onFx = (e: Event) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const d = (e as CustomEvent<FxEvent>).detail;
      const W = innerWidth, H = innerHeight;
      if (d.kind === 'confetti') {
        for (const side of [0, 1]) for (let i = 0; i < 70; i++) {
          const dir = side ? -1 : 1;
          parts.current.push({
            kind: 'confetti', x: side ? W + 10 : -10, y: H * 0.85, vx: dir * between(350, 950), vy: -between(900, 1550),
            rot: between(0, 6.3), vrot: between(-7, 7), flip: between(0, 6.3), vflip: between(6, 14),
            size: between(6, 11), color: CONFETTI[i % CONFETTI.length], life: between(3.5, 5), bounces: 0,
          });
        }
      } else {
        const n = d.count ?? 14;
        for (let i = 0; i < n; i++) {
          parts.current.push({
            kind: 'coin', x: d.x, y: d.y, vx: between(-260, 260), vy: -between(480, 880),
            rot: 0, vrot: 0, flip: between(0, 6.3), vflip: between(10, 20),
            size: between(7, 10), color: '#f5c542', life: 2.2, floor: Math.min(H - 12, d.y + between(80, 120)), bounces: 0,
          });
        }
      }
      setActive(true);
    };
    window.addEventListener(FX_EVENT, onFx);
    return () => window.removeEventListener(FX_EVENT, onFx);
  }, []);

  useEffect(() => {
    if (!active) return;
    const c = canvas.current; const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    addEventListener('resize', resize);
    let last = performance.now(), raf = 0, lastClink = 0;

    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      if (stepParticles(parts.current, dt) && now - lastClink > 70) { sfx('clink'); lastClink = now; }
      parts.current = parts.current.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts.current) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 0.6);
        ctx.translate(p.x, p.y);
        if (p.kind === 'confetti') {
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.flip)); // a paper strip turning over in the air
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        } else {
          const sx = Math.max(0.15, Math.abs(Math.cos(p.flip))); // spinning coin, seen edge-on now and then
          ctx.scale(sx, 1);
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = '#b8860b'; ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.78, 0, Math.PI * 2);
          ctx.fillStyle = p.color; ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(-p.size * 0.45, -p.size * 0.5, p.size * 0.3, p.size * 0.6);
        }
        ctx.restore();
      }
      if (parts.current.length) raf = requestAnimationFrame(frame); else setActive(false);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, [active]);

  return active ? <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] h-full w-full" /> : null;
}
