'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SnakeEngine, type SnakeState, type SnakeMove, SNAKE_MANIFEST } from '@slgh/shared';
import { createPlayer } from '@slgh/shared';
import dynamic from 'next/dynamic';
import { DiceLoader } from './Art';

// Each game is its own download: opening Chess never fetches Scrabble's code.
const loading = () => <main className="mx-auto max-w-2xl p-4"><DiceLoader label="Setting up the game" /></main>;
const DiceGame = dynamic(() => import('./DiceGame'), { loading });
const SnakeAndLadderGame = dynamic(() => import('./SnakeAndLadderGame'), { loading });
const ChessGame = dynamic(() => import('./ChessGame'), { loading });
const CheckersGame = dynamic(() => import('./CheckersGame'), { loading });
const WordSearchGame = dynamic(() => import('./WordSearchGame'), { loading });
const ScrabbleGame = dynamic(() => import('./ScrabbleGame'), { loading });
const UnoGame = dynamic(() => import('./UnoGame'), { loading });
const SalonePolyGame = dynamic(() => import('./SalonePolyGame'), { loading });
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

export default function BuiltInGamePlay({ slug }: { slug: string }) {
  const router = useRouter();

  const back = (game: string) => () => router.push(`/games/${game}`);

  if (slug === 'dice') {
    return <DiceGame onBack={back('dice')} />;
  }

  if (slug === 'snake') {
    return <SnakeGame router={router} />;
  }

  if (slug === 'snake-and-ladder') {
    return <SnakeAndLadderGame onBack={back('snake-and-ladder')} />;
  }

  if (slug === 'chess') {
    return <ChessGame onBack={back('chess')} />;
  }

  if (slug === 'checkers') {
    return <CheckersGame onBack={back('checkers')} />;
  }

  if (slug === 'word-search') {
    return <WordSearchGame onBack={back('word-search')} />;
  }

  if (slug === 'uno') {
    return <UnoGame onBack={back('uno')} />;
  }

  if (slug === 'salone-poly') {
    return <SalonePolyGame onBack={back('salone-poly')} />;
  }

  if (slug === 'scrabble') {
    return <ScrabbleGame onBack={back('scrabble')} />;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <button onClick={() => router.push('/games')} className="text-secondary">
        ← Back to Games
      </button>
      <div className="card p-5">
        <h1>Coming Soon</h1>
        <p>This game is not yet available. Snake, Snake &amp; Ladder, Chess, Checkers, Word Search, Scrabble, UNO, Salone-Poly and Dice are ready to play!</p>
      </div>
    </main>
  );
}

function SnakeGame({ router }: { router: ReturnType<typeof useRouter> }) {
  const [state, setState] = useState<SnakeState | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const engineRef = useRef(new SnakeEngine(20, 150));
  const gameLoopRef = useRef<number | null>(null);
  const lastScore = useRef(0);
  useEffect(() => { if (score > lastScore.current) sfx('pop'); lastScore.current = score; }, [score]);
  useEndSfx(gameOver, true);

  useEffect(() => {
    const player = createPlayer('player', 'You', false);
    const initialState = engineRef.current.initialize([player], { boardSize: 20, speed: 150 });
    setState(initialState);
    setScore(0);
    setGameOver(false);
  }, []);

  useEffect(() => {
    if (!state || state.status !== 'playing' || gameOver) return;

    const loop = () => {
      setState((prevState) => {
        if (!prevState || prevState.status !== 'playing') return prevState;

        if (isAIPlaying) {
          const aiMove = engineRef.current.getAIMove(prevState, difficulty);
          const newState = engineRef.current.applyMove(prevState, aiMove);
          setScore(newState.score);
          if (newState.status === 'finished') {
            setGameOver(true);
          }
          return newState;
        }

        const newState = engineRef.current.tick(prevState);
        setScore(newState.score);
        if (newState.status === 'finished') {
          setGameOver(true);
        }
        return newState;
      });
    };

    gameLoopRef.current = window.setInterval(loop, state.speed);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [state, gameOver, isAIPlaying, difficulty]);

  // Keyboard, swipe and the on-screen pad all steer through here.
  const turn = useCallback((move: SnakeMove) => {
    if (!state || gameOver || isAIPlaying || !engineRef.current.isValidMove(state, move, 0)) return false;
    setState((prevState) => (prevState ? engineRef.current.applyMove(prevState, move) : prevState));
    return true;
  }, [state, gameOver, isAIPlaying]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const keyMap: Record<string, SnakeMove> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const move = keyMap[e.key];
    if (move && turn(move)) e.preventDefault();
  }, [turn]);

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onSwipeEnd = (e: React.PointerEvent) => {
    const start = swipe.current; swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (state) {
      localStorage.setItem('snake_game_state', engineRef.current.serialize(state));
    }
  }, [state]);

  useEffect(() => {
    const saved = localStorage.getItem('snake_game_state');
    if (saved) {
      try {
        const loadedState = engineRef.current.deserialize(saved);
        if (loadedState.status === 'playing') {
          setState(loadedState);
          setScore(loadedState.score);
        }
      } catch (e) {
        console.error('Failed to load saved game:', e);
      }
    }
  }, []);

  const handleRestart = () => {
    const player = createPlayer('player', 'You', false);
    const initialState = engineRef.current.initialize([player], { boardSize: 20, speed: 150 });
    setState(initialState);
    setScore(0);
    setGameOver(false);
    localStorage.removeItem('snake_game_state');
  };

  const handleSaveAndExit = () => {
    if (state) {
      localStorage.setItem('snake_game_state', engineRef.current.serialize(state));
    }
    router.push('/games/snake');
  };

  if (!state) {
    return <div className="p-4">Loading...</div>;
  }

  const boardSize = state.boardSize;
  const pad = (move: SnakeMove, label: string, d: string, area: string) => (
    <button type="button" aria-label={label} onClick={() => turn(move)} style={{ gridArea: area }}
      className="btn btn-outline h-14 min-h-0 w-14 rounded-2xl p-0">
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  );

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={() => router.push('/games/snake')} className="back-link">
        ← Back to Snake
      </button>

      <div className="card space-y-4 p-3 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h1>{SNAKE_MANIFEST.name}</h1>
          <div className="stat-num text-2xl" aria-live="polite">{score}<span className="sr-only"> points</span></div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')} className="field">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={isAIPlaying} onChange={(e) => setIsAIPlaying(e.target.checked)} />
            AI Play
          </label>
        </div>

        {/* Scales to the screen; swipe on it to steer */}
        <div
          className="mx-auto grid aspect-square w-full max-w-[480px] select-none overflow-hidden rounded-xl border-2 border-border"
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
        </div>

        {!isAIPlaying && (
          <div className="touch-only mx-auto grid w-fit gap-2" style={{ gridTemplateAreas: '". up ." "left . right" ". down ."' }}>
            {pad('up', 'Up', 'm6 15 6-6 6 6', 'up')}
            {pad('left', 'Left', 'm15 6-6 6 6 6', 'left')}
            {pad('right', 'Right', 'm9 6 6 6-6 6', 'right')}
            {pad('down', 'Down', 'm6 9 6 6 6-6', 'down')}
          </div>
        )}

        <p className="text-sm text-muted">
          {isAIPlaying
            ? 'Watch the AI play! Change difficulty to see different strategies.'
            : <>Swipe on the board or use the arrows<span className="hidden [@media(pointer:fine)]:inline"> (or arrow keys / WASD)</span>. Avoid walls and yourself; eat food to grow.</>}
        </p>

        <div className="flex gap-2">
          <button onClick={handleRestart} className="btn btn-primary flex-1">Restart</button>
          <button onClick={handleSaveAndExit} className="btn btn-outline flex-1">Save &amp; Exit</button>
        </div>

        {gameOver && (
          <div className="flash rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">
            <h2>Game Over!</h2>
            <p className="text-lg">Final Score: {score}</p>
            <button onClick={handleRestart} className="btn btn-primary mt-2">Play Again</button>
          </div>
        )}
      </div>
    </main>
  );
}
