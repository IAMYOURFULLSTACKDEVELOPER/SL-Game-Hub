'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { SnakeState, SnakeMove } from '@slgh/shared';

// The Snake board and its controls, shared by solo Snake and the online race.

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

/** Scales to the screen; swipe on it to steer */
export function SnakeBoard({ state, onTurn, children }: { state: SnakeState; onTurn: (move: SnakeMove) => void; children?: ReactNode }) {
  const boardSize = state.boardSize;
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeEnd = (e: React.PointerEvent) => {
    const start = swipe.current; swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    onTurn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  return (
    <div
      className="relative mx-auto grid aspect-square w-full max-w-[480px] select-none overflow-hidden rounded-xl border-2 border-border"
      style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)`, backgroundColor: '#1a1a2e', touchAction: 'none' }}
      onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={onSwipeEnd}
      onPointerCancel={() => { swipe.current = null; }}
    >
      {Array.from({ length: boardSize * boardSize }).map((_, i) => {
        const isSnake = state.snake.includes(i);
        const isHead = state.snake[0] === i;
        const isFood = state.food === i;
        return (
          <div
            key={i}
            style={{
              backgroundColor: isHead ? '#4ade80' : isSnake ? '#22c55e' : isFood ? '#ef4444' : 'transparent',
              border: isSnake || isFood ? '1px solid #166534' : '1px solid #2d2d44',
              borderRadius: isFood ? '50%' : '2px',
            }}
          />
        );
      })}
      {children}
    </div>
  );
}

/** On-screen arrows for touch screens */
export function SnakePad({ onTurn }: { onTurn: (move: SnakeMove) => void }) {
  const pad = (move: SnakeMove, label: string, d: string, area: string) => (
    <button type="button" aria-label={label} onClick={() => onTurn(move)} style={{ gridArea: area }}
      className="btn btn-outline h-14 min-h-0 w-14 rounded-2xl p-0">
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
