'use client';
// Fire-and-forget physics effects, drawn by <PhysicsFX /> (mounted once in the layout).

export type FxEvent = { kind: 'confetti' } | { kind: 'coins'; x: number; y: number; count?: number };
export const FX_EVENT = 'slgh:fx';

function fx(detail: FxEvent) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<FxEvent>(FX_EVENT, { detail }));
}

/** Confetti bursts in from both bottom corners and flutters down. */
export const celebrate = () => fx({ kind: 'confetti' });

/** Coins jump out of a point on screen, bounce and spin to a stop. */
export const coinBurst = (x: number, y: number, count?: number) => fx({ kind: 'coins', x, y, count });

/** Coins jump out of the middle of an element. */
export function coinBurstFrom(el: Element | null, count?: number) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  coinBurst(r.left + r.width / 2, r.top + r.height / 2, count);
}
