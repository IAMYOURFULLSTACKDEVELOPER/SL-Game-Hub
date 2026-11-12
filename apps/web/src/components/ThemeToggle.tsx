'use client';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';

type VT = { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

export function ThemeToggle({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-ghost btn-icon theme-toggle" aria-label={label} title={label} data-silent
      onClick={(e) => {
        const d = document.documentElement;
        const next = d.dataset.theme === 'dark' ? 'light' : 'dark';
        const apply = () => {
          d.dataset.theme = next;
          try { localStorage.setItem('theme', next); } catch { /* private mode */ }
        };
        sfx(next === 'dark' ? 'toggleOff' : 'toggleOn');
        // Where supported, the new theme spreads out in a circle from the button.
        const doc = document as Document & VT;
        if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
        const x = e.clientX || innerWidth - 40, y = e.clientY || 30;
        const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        doc.startViewTransition(apply).ready.then(() => {
          d.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: 550, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
        });
      }}>
      <span className="theme-icon theme-sun"><Icon name="sun" /></span>
      <span className="theme-icon theme-moon"><Icon name="moon" /></span>
    </button>
  );
}
