'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SnakeEngine, createPlayer, type SnakeState, type SnakeMove } from '@slgh/shared';
import { RoomLobby, JoinRequests } from './RoomLobby';
import { VoiceChat } from './VoiceChat';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { SnakeBoard, SnakePad, useSnakeKeys } from './SnakeBoard';
import { useRoom, type RoomApi } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

// Online Snake race: every phone plays its own snake and tells the server its score.
// The server (convex/roomGames.ts snakeSpec) keeps the scoreboard and ends the race
// when everyone has crashed or the time limit runs out.

const engine = new SnakeEngine(20, 150);
const SAVE_KEY = 'snake_race_v1';
const COUNTDOWN = 3;

/** What the server sends */
interface RaceState {
  players: { id: string; name: string }[];
  status: 'waiting' | 'playing' | 'finished';
  winner: number | null;
  scores: number[];
  alive: boolean[];
  endsAt: number | null;
  createdAt: number;
}
/** Your snake, kept on this phone so a reload carries on where you were */
interface Saved { race: string; base: number; snake: SnakeState }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function readSaved(): Saved | null {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Saved | null; } catch { return null; }
}

export default function SnakeRace() {
  return <ConvexRoomProvider><OnlineSnake /></ConvexRoomProvider>;
}

function OnlineSnake() {
  const room = useRoom('snake');
  const v = room.view;
  const state = (v?.state ?? null) as RaceState | null;
  const status = state?.status;
  // A score that was on its way when the race ended is refused; that is not worth an error box.
  const { setError } = room;
  useEffect(() => { if (status === 'finished') setError(null); }, [status, setError]);

  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && status === 'playing';
  return (
    <div className="space-y-4">
      <VoiceChat room={room} />
      {room.joined && v && state && <Race key={`${v.code}:${state.createdAt}`} race={`${v.code}:${state.createdAt}`} state={state} seat={v.me?.seat ?? -1} room={room} />}
      {playing && <JoinRequests room={room} />}
      {room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>}
      {!playing && <RoomLobby room={room} title="Snake" maxSeats={6} timer bots={false} timerOptions={[1, 2, 3, 5]} />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm('Leave this race? Your snake stops and you drop out.')) room.leave(); }}><Icon name="logout" size={18} />Leave race</button>}
    </div>
  );
}

/** One race. Remounted (fresh state) for every new race in the room. */
function Race({ race, state, seat, room }: { race: string; state: RaceState; seat: number; room: RoomApi }) {
  const playing = state.status === 'playing';
  const finished = state.status === 'finished';
  const seated = seat >= 0 && seat < state.players.length;

  // Your snake: carried on from this phone, or a new one if you are racing.
  const [init] = useState(() => {
    if (!seated) return null;
    const saved = readSaved();
    if (saved?.race === race && saved.snake) return { snake: saved.snake, base: saved.base };
    if (playing && state.alive[seat]) {
      // Points already on the scoreboard (from another device) are kept: scores never go down.
      return { snake: engine.initialize([createPlayer('me', 'You', false)], { boardSize: 20, speed: 150 }), base: state.scores[seat] ?? 0 };
    }
    return null;
  });
  const base = init?.base ?? 0;
  const [snake, setSnake] = useState<SnakeState | null>(init?.snake ?? null);
  const [countdown, setCountdown] = useState(COUNTDOWN);
  const serverAlive = seated && !!state.alive[seat];
  const alive = !!snake && snake.status === 'playing' && playing && serverAlive;
  const live = alive && countdown === 0;

  // Three seconds to get ready (and to aim) before your snake sets off.
  useEffect(() => {
    if (!alive || countdown <= 0) return;
    sfx('click');
    const t = setTimeout(() => { setCountdown((c) => c - 1); if (countdown === 1) sfx('toggleOn'); }, 1000);
    return () => clearTimeout(t);
  }, [alive, countdown]);

  // Game loop: one steady interval while your snake is moving.
  const speed = snake?.speed ?? 150;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setSnake((s) => (s && s.status === 'playing' ? engine.tick(s) : s)), speed);
    return () => clearInterval(t);
  }, [live, speed]);

  // Keyboard, swipe and the on-screen pad all steer through here.
  const turn = useCallback((move: SnakeMove) => {
    if (!alive || !snake || !engine.isValidMove(snake, move, 0)) return false;
    setSnake((s) => {
      if (!s || s.status !== 'playing') return s;
      // Before the start you only aim; once racing a turn moves the snake, as in solo Snake.
      return countdown > 0 ? { ...s, direction: move, nextDirection: move } : engine.applyMove(s, move);
    });
    return true;
  }, [alive, snake, countdown]);
  useSnakeKeys(turn);

  // Sounds: a pop for food, a thud for your crash.
  const score = snake?.score ?? 0;
  const lastScore = useRef(score);
  useEffect(() => { if (score > lastScore.current) sfx('pop'); lastScore.current = score; }, [score]);
  const snakeAlive = snake?.status === 'playing';
  const wasAlive = useRef(snakeAlive);
  useEffect(() => { if (wasAlive.current && !snakeAlive) sfx('error'); wasAlive.current = snakeAlive; }, [snakeAlive]);
  useEndSfx(finished, seated && state.winner !== seat);

  // Tell the server: every time your score changes, and once when you crash.
  const move = useRef(room.move);
  move.current = room.move;
  const sent = useRef({ score: seated ? state.scores[seat] ?? 0 : 0, alive: serverAlive });
  const total = snake ? base + score : null;
  const endsAt = state.endsAt;
  useEffect(() => {
    if (total === null || !playing || !seated || !sent.current.alive) return;
    if (endsAt && Date.now() >= endsAt) return; // the server is about to end the race
    const next = { score: Math.max(total, sent.current.score), alive: !!snakeAlive };
    if (next.score === sent.current.score && next.alive) return;
    sent.current = next;
    void move.current({ type: 'snake_score', score: next.score, alive: next.alive });
  }, [total, snakeAlive, playing, seated, endsAt]);
  // If the crash never reached the server (bad connection), say it again.
  const crashed = !!snake && !snakeAlive;
  useEffect(() => {
    if (!crashed || !playing || !serverAlive) return;
    const t = setTimeout(() => { void move.current({ type: 'snake_score', score: sent.current.score, alive: false }); }, 5000);
    return () => clearTimeout(t);
  }, [crashed, playing, serverAlive]);

  // Keep your snake on this phone until the race is over.
  useEffect(() => {
    if (!snake) return;
    try {
      if (playing) localStorage.setItem(SAVE_KEY, JSON.stringify({ race, base, snake } satisfies Saved));
      else localStorage.removeItem(SAVE_KEY);
    } catch { /* private mode */ }
  }, [snake, playing, race, base]);

  // Time left (the server ends the race at endsAt; this only shows it).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt || !playing) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt, playing]);
  const left = endsAt && playing ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;

  const myScore = seated ? Math.max(state.scores[seat] ?? 0, total ?? 0) : 0;
  const order = state.players.map((_, i) => i).sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  const stillIn = state.alive.filter(Boolean).length;
  const nameOf = (i: number) => state.players[i]?.name ?? `Player ${i + 1}`;

  return (
    <div className="space-y-3">
      {/* your score and the clock */}
      {playing && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg/50 px-4 py-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{seated ? 'Your score' : 'Watching'}</p>
            {seated ? <p className="stat-num text-2xl" aria-live="polite">{myScore}<span className="sr-only"> points</span></p>
              : <p className="font-semibold">{stillIn} still racing</p>}
          </div>
          {left !== null && (
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Time left</p>
              <p className={`stat-num text-2xl ${left <= 10 ? 'text-danger' : ''}`} aria-label={`${left} seconds left`}>{fmt(left)}</p>
            </div>
          )}
        </div>
      )}

      {/* your board */}
      {playing && snake && (
        <>
          <SnakeBoard state={snake} onTurn={turn}>
            {alive && countdown > 0 && (
              <div className="absolute inset-0 grid place-items-center bg-black/40 p-4 text-center text-white">
                <div>
                  <p key={countdown} className="pop-in font-display text-7xl font-bold">{countdown}</p>
                  <p className="mt-1 text-sm font-semibold">Get ready! Swipe or use the arrows to aim.</p>
                </div>
              </div>
            )}
            {!alive && (
              <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center text-white">
                <div>
                  <p className="text-5xl" aria-hidden>💥</p>
                  <p className="font-display text-2xl font-bold">Crashed with {myScore} points</p>
                  <p className="mt-1 text-sm">{stillIn > 0 ? `Watching the others: ${stillIn} still racing.` : 'Waiting for the result…'}</p>
                </div>
              </div>
            )}
          </SnakeBoard>
          {alive && <SnakePad onTurn={turn} />}
          {alive && (
            <p className="text-sm text-muted">
              Swipe on the board or use the arrows<span className="hidden [@media(pointer:fine)]:inline"> (or arrow keys / WASD)</span>. Highest score wins: eat food, avoid walls and yourself.
            </p>
          )}
        </>
      )}
      {playing && seated && !snake && (
        <p className="rounded-2xl bg-bg/60 p-4 text-center font-semibold text-muted">Your snake is out of this race. Watch the scoreboard.</p>
      )}
      {playing && !seated && (
        <p className="rounded-2xl bg-bg/60 p-4 text-center font-semibold text-muted">You are watching this race. You can join the next one.</p>
      )}

      {/* the result */}
      {finished && (
        <div className="flash space-y-1 rounded-3xl border border-accent/40 bg-accent/10 p-5 text-center">
          <p className="text-4xl" aria-hidden>{state.winner !== null && state.winner === seat ? '🏆' : '🐍'}</p>
          <h2>{state.winner === null ? 'It’s a tie!' : state.winner === seat ? 'You win!' : `${nameOf(state.winner)} wins!`}</h2>
          <p className="text-muted">
            {state.winner === null ? `Joint top score: ${Math.max(0, ...state.scores)} points.` : `${state.scores[state.winner] ?? 0} points.`}
            {seated && state.winner !== seat && ` You scored ${state.scores[seat] ?? 0}.`}
          </p>
        </div>
      )}

      {/* scoreboard */}
      <div className="rounded-2xl border border-border bg-surface/70 p-3">
        <p className="label">{finished ? 'Final scores' : 'Scoreboard'}</p>
        <ol className="space-y-1.5">
          {order.map((i, rank) => {
            const out = !state.alive[i];
            return (
              <li key={state.players[i].id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${i === seat ? 'bg-primary/10' : ''}`}>
                <span className="w-4 shrink-0 text-center text-sm font-bold text-muted">{rank + 1}</span>
                <span className="avatar-ring h-8 w-8 shrink-0 font-display text-sm font-bold">{nameOf(i)[0]?.toUpperCase()}</span>
                <span className={`min-w-0 flex-1 truncate font-semibold ${out && playing ? 'text-muted' : ''}`}>
                  {nameOf(i)}{i === seat ? ' (you)' : ''}{finished && state.winner === i ? ' 🏆' : ''}
                </span>
                {playing && <span className={`chip ${out ? 'chip-muted' : 'chip-primary'}`}>{out ? 'Crashed' : 'Racing'}</span>}
                <span className="w-12 shrink-0 text-right font-display text-lg font-bold tabular-nums">{state.scores[i] ?? 0}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
