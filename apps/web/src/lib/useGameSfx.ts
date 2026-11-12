'use client';
import { useEffect, useRef } from 'react';
import { sfx } from './sound';

/** Plays the win fanfare (or the lose jingle) once, when a game goes from playing to over. */
export function useEndSfx(over: boolean, lost = false) {
  const was = useRef(over);
  useEffect(() => {
    if (over && !was.current) sfx(lost ? 'lose' : 'win');
    was.current = over;
  }, [over, lost]);
}
