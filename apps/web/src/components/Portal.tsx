'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders overlays at the end of <body>. Cards use backdrop-filter, which turns them into the frame
 * that `position: fixed` children are placed against, so a modal inside a card would be clipped to it.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.body); }, []);
  return target ? createPortal(children, target) : null;
}
