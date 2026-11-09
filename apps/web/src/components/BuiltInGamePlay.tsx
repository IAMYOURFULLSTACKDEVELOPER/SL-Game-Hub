'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SnakeEngine, type SnakeState, type SnakeMove, SNAKE_MANIFEST } from '@slgh/shared';
import { createPlayer } from '@slgh/shared';
import DiceGame from './DiceGame';
import SnakeAndLadderGame from './SnakeAndLadderGame';
import ChessGame from './ChessGame';
import CheckersGame from './CheckersGame';
import WordSearchGame from './WordSearchGame';
import ScrabbleGame from './ScrabbleGame';

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
        <p>This game is not yet available. Snake, Snake &amp; Ladder, Chess, Checkers, Word Search, Scrabble and Dice are ready to play!</p>
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!state || gameOver || isAIPlaying) return;

    const keyMap: Record<string, SnakeMove> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    };

    const move = keyMap[e.key];
    if (move && engineRef.current.isValidMove(state, move, 0)) {
      e.preventDefault();
      setState((prevState) => {
        if (!prevState) return prevState;
        return engineRef.current.applyMove(prevState, move);
      });
    }
  }, [state, gameOver, isAIPlaying]);

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
  const cellSize = Math.min(30, Math.floor(600 / boardSize));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <button onClick={() => router.push('/games/snake')} className="text-secondary">
        ← Back to Snake
      </button>

      <div className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h1>{SNAKE_MANIFEST.name}</h1>
          <div className="text-2xl font-bold">Score: {score}</div>
        </div>

        <div className="flex gap-4 items-center">
          <label>
            Difficulty:
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
              className="ml-2 border rounded px-2 py-1"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isAIPlaying}
              onChange={(e) => setIsAIPlaying(e.target.checked)}
            />
            AI Play
          </label>
        </div>

        <div
          className="border-2 border-border mx-auto"
          style={{
            width: boardSize * cellSize,
            height: boardSize * cellSize,
            position: 'relative',
            backgroundColor: '#1a1a2e',
          }}
        >
          {Array.from({ length: boardSize * boardSize }).map((_, i) => {
            const x = i % boardSize;
            const y = Math.floor(i / boardSize);
            const isSnake = state.snake.includes(i);
            const isHead = state.snake[0] === i;
            const isFood = state.food === i;

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x * cellSize,
                  top: y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: isHead
                    ? '#4ade80'
                    : isSnake
                    ? '#22c55e'
                    : isFood
                    ? '#ef4444'
                    : 'transparent',
                  border: isSnake || isFood ? '1px solid #166534' : '1px solid #2d2d44',
                  borderRadius: isFood ? '50%' : '2px',
                }}
              />
            );
          })}
        </div>

        <div className="text-sm text-muted">
          {!isAIPlaying && (
            <>
              Controls: Arrow keys or WASD to move
              <br />
              Avoid walls and yourself. Eat food to grow and score points.
            </>
          )}
          {isAIPlaying && <>Watch the AI play! Change difficulty to see different strategies.</>}
        </div>

        <div className="flex gap-2">
          <button onClick={handleRestart} className="btn btn-primary flex-1">
            Restart
          </button>
          <button onClick={handleSaveAndExit} className="btn btn-secondary flex-1">
            Save & Exit
          </button>
        </div>

        {gameOver && (
          <div className="rounded-lg border-2 border-accent p-4 text-center">
            <h2 className="text-xl font-bold">Game Over!</h2>
            <p className="text-lg">Final Score: {score}</p>
            <button onClick={handleRestart} className="btn btn-primary mt-2">
              Play Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
