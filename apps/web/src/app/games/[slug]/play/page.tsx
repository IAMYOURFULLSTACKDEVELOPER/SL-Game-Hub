import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BuiltInGamePlay from '@/components/BuiltInGamePlay';

export default async function GamePlayPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  // Check if game exists and get its type
  const { data: game } = await supabase
    .from('games')
    .select('id,slug,is_builtin')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!game) {
    redirect('/games');
  }

  // If it's a built-in game, use the client-side implementation
  if (game.is_builtin) {
    return <BuiltInGamePlay slug={params.slug} />;
  }

  // If it's an HTML5 game, redirect to the HTML5 player
  redirect(`/games/${params.slug}/play/html5`);
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

function SnakeAndLadderGame({ router }: { router: ReturnType<typeof useRouter> }) {
  const [state, setState] = useState<SnakeAndLadderState | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [numPlayers, setNumPlayers] = useState(2);
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const engineRef = useRef(new SnakeAndLadderEngine());

  useEffect(() => {
    const players = Array.from({ length: numPlayers }, (_, i) =>
      createPlayer(`player${i}`, `Player ${i + 1}`, i > 0, i > 0 ? difficulty : undefined)
    );
    const initialState = engineRef.current.initialize(players);
    setState(initialState);
    setGameOver(false);
  }, [numPlayers, difficulty]);

  const handleRoll = () => {
    if (!state || gameOver) return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    let move: number;

    if (currentPlayer.isAI || isAIPlaying) {
      move = engineRef.current.getAIMove(state, difficulty);
    } else {
      move = Math.floor(Math.random() * 6) + 1;
    }

    const newState = engineRef.current.applyMove(state, move);
    setState(newState);

    if (newState.status === 'finished') {
      setGameOver(true);
    }
  };

  const handleRestart = () => {
    const players = Array.from({ length: numPlayers }, (_, i) =>
      createPlayer(`player${i}`, `Player ${i + 1}`, i > 0, i > 0 ? difficulty : undefined)
    );
    const initialState = engineRef.current.initialize(players);
    setState(initialState);
    setGameOver(false);
  };

  const handleSaveAndExit = () => {
    if (state) {
      localStorage.setItem('snake_and_ladder_game_state', engineRef.current.serialize(state));
    }
    router.push('/games/snake-and-ladder');
  };

  if (!state) {
    return <div className="p-4">Loading...</div>;
  }

  const boardSize = state.boardSize;
  const cellSize = Math.min(40, Math.floor(500 / boardSize));

  // Convert position to board coordinates (zigzag pattern)
  const getCellCoords = (pos: number) => {
    const row = Math.floor((pos - 1) / boardSize);
    const col = (pos - 1) % boardSize;
    const actualCol = row % 2 === 0 ? col : boardSize - 1 - col;
    const actualRow = boardSize - 1 - row;
    return { x: actualCol, y: actualRow };
  };

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <button onClick={() => router.push('/games/snake-and-ladder')} className="text-secondary">
        ← Back to Snake & Ladder
      </button>

      <div className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h1>{SNAKE_AND_LADDER_MANIFEST.name}</h1>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          <label>
            Players:
            <select
              value={numPlayers}
              onChange={(e) => setNumPlayers(Number(e.target.value))}
              className="ml-2 border rounded px-2 py-1"
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label>
            AI Difficulty:
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
            AI Play All
          </label>
        </div>

        <div
          className="border-2 border-border mx-auto"
          style={{
            width: boardSize * cellSize,
            height: boardSize * cellSize,
            position: 'relative',
            backgroundColor: '#f5f5dc',
          }}
        >
          {Array.from({ length: boardSize * boardSize }).map((_, i) => {
            const row = Math.floor(i / boardSize);
            const col = i % boardSize;
            const pos = row * boardSize + col + 1;
            const isSnakeStart = Object.keys(state.snakes).map(Number).includes(pos);
            const isLadderStart = Object.keys(state.ladders).map(Number).includes(pos);

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: col * cellSize,
                  top: (boardSize - 1 - row) * cellSize,
                  width: cellSize,
                  height: cellSize,
                  border: '1px solid #ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: cellSize * 0.3,
                  backgroundColor: isSnakeStart ? '#ffcccc' : isLadderStart ? '#ccffcc' : 'white',
                }}
              >
                {pos}
              </div>
            );
          })}

          {state.playerPositions.map((pos, idx) => {
            const { x, y } = getCellCoords(pos);
            const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: x * cellSize + cellSize * 0.2,
                  top: y * cellSize + cellSize * 0.2,
                  width: cellSize * 0.6,
                  height: cellSize * 0.6,
                  borderRadius: '50%',
                  backgroundColor: colors[idx],
                  border: '2px solid black',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: cellSize * 0.25,
                  zIndex: 10,
                }}
              >
                {idx + 1}
              </div>
            );
          })}
        </div>

        <div className="text-sm text-muted">
          Current Player: <strong>{state.players[state.currentPlayerIndex].name}</strong>
          {state.diceValue && <> | Last Roll: <strong>{state.diceValue}</strong></>}
        </div>

        <div className="flex gap-2">
          <button onClick={handleRoll} className="btn btn-primary flex-1" disabled={gameOver}>
            Roll Dice
          </button>
          <button onClick={handleRestart} className="btn btn-secondary flex-1">
            Restart
          </button>
          <button onClick={handleSaveAndExit} className="btn btn-secondary flex-1">
            Save & Exit
          </button>
        </div>

        {gameOver && (
          <div className="rounded-lg border-2 border-accent p-4 text-center">
            <h2 className="text-xl font-bold">
              {state.winner !== null ? `${state.players[state.winner].name} Wins!` : 'Game Over'}
            </h2>
            <button onClick={handleRestart} className="btn btn-primary mt-2">
              Play Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
