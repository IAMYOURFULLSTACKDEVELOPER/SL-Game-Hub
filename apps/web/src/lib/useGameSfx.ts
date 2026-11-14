'use client';
import { useEffect, useRef } from 'react';
import { sfx } from './sound';
import { celebrate } from './celebrate';

/** Plays the win fanfare (with confetti) or the lose jingle once, when a game goes from playing to over. */
export function useEndSfx(over: boolean, lost = false) {
  const was = useRef(over);
  useEffect(() => {
    if (over && !was.current) {
      sfx(lost ? 'lose' : 'win');
      if (!lost) celebrate();
    }
    was.current = over;
  }, [over, lost]);
}
