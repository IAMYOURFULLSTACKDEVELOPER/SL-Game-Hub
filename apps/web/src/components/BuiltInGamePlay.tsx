'use client';

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { SnakeEngine, type SnakeState, type SnakeMove, SNAKE_MANIFEST } from '@slgh/shared';
import { createPlayer } from '@slgh/shared';
import dynamic from 'next/dynamic';
import { DiceLoader } from './Art';
import { Icon } from './Icon';
import { SnakeBoard, SnakePad } from './SnakeBoard';

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
// The online race (and its Convex connection) only downloads when someone opens it.
const SnakeRace = dynamic(() => import('./SnakeRace'), {
  loading: () => <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>,
});
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
  const [mode, setMode] = useState<'solo' | 'online'>('solo');
  // A shared room link opens straight into the online race.
  useEffect(() => { const q = new URLSearchParams(location.search); if (q.has('room') || q.has('online')) setMode('online'); }, []);
  const tabs = (
    <div role="tablist" aria-label="How to play" className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-bg/60 p-1">
      {([['solo', 'Solo', 'gamepad'], ['online', 'Online', 'globe']] as const).map(([m, label, icon]) => (
        <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
          className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-surface text-primary shadow-soft' : 'text-muted'}`}>
          <Icon name={icon} size={16} />{label}
        </button>
      ))}
    </div>
  );
  if (mode === 'solo') return <LocalSnake router={router} tabs={tabs} />;
  return (
    <main className="mx-auto max-w-2xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={() => router.push('/games/snake')} className="back-link">
        ← Back to Snake
      </button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>{SNAKE_MANIFEST.name}</h1>
        {tabs}
        <SnakeRace />
      </div>
    </main>
  );
}

function LocalSnake({ router, tabs }: { router: ReturnType<typeof useRouter>; tabs: ReactNode }) {
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

        {tabs}

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

        <SnakeBoard state={state} onTurn={turn} />

        {!isAIPlaying && <SnakePad onTurn={turn} />}

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
