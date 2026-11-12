'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { sfx, unlock } from '@/lib/sound';

// One set of delegated listeners gives the whole app its feel: click and hover sounds, button
// ripples, the cursor spotlight on cards and a progress bar while the next page loads.
// Opt an element out of sounds with data-silent.
const CLICKABLE = 'a[href],button,[role=button],summary,select,input[type=submit]';

export function FX() {
  const pathname = usePathname();
  const search = useSearchParams();
  const bar = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const done = useRef<number>();

  const progress = (state: 'start' | 'done') => {
    const el = bar.current; if (!el) return;
    window.clearTimeout(done.current);
    if (state === 'start') {
      el.dataset.state = 'start';
      done.current = window.setTimeout(() => progress('done'), 10000); // never hang forever
    } else if (el.dataset.state === 'start') {
      el.dataset.state = 'done';
      done.current = window.setTimeout(() => { el.dataset.state = ''; }, 500);
    }
  };

  useEffect(() => {
    let hovered: Element | null = null;
    let raf = 0;
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const onDown = (e: PointerEvent) => {
      unlock();
      const el = (e.target as Element).closest(CLICKABLE);
      if (!el || el.closest('[data-silent]') || (el as HTMLButtonElement).disabled) return;
      sfx('click'); // checkboxes and radios get a softer "pop" from the change listener
      if (el.classList.contains('btn') && !still.matches) {
        const r = el.getBoundingClientRect();
        const s = document.createElement('span');
        const size = Math.max(r.width, r.height) * 2;
        s.className = 'ripple';
        s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        el.appendChild(s);
        s.addEventListener('animationend', () => s.remove());
      }
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'checkbox' || t.type === 'radio') sfx('pop');
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element).closest('.btn,.card-hover,nav a');
      if (el && el !== hovered && !el.closest('[data-silent]')) sfx('hover');
      hovered = el;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = (e.target as Element).closest<HTMLElement>('.spotlight');
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && (url.pathname !== location.pathname || url.search !== location.search)) progress('start');
    };
    const onSubmit = (e: SubmitEvent) => { if (!e.defaultPrevented) progress('start'); };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('change', onChange);
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('change', onChange);
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    progress('done');
    sfx('nav');
  }, [pathname, search]);

  return <div ref={bar} id="route-progress" aria-hidden="true" />;
}
