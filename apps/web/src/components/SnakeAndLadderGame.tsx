'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SnakeAndLadderEngine, SNAKE_AND_LADDER_MANIFEST, SNAKE_AND_LADDER_FINISH, createPlayer, rollDie,
  type SnakeAndLadderState, type SnakeAndLadderLastMove,
} from '@slgh/shared';
import SnakeAndLadderRulebook from './SnakeAndLadderRulebook';
import DiceTray from './DiceTray';
import { RoomLobby, JoinRequests } from './RoomLobby';
import { VoiceChat } from './VoiceChat';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { useRoom } from '@/lib/useRoom';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new SnakeAndLadderEngine();
const SAVE_KEY = 'snake_and_ladder_game_state';
const BOARD_IMG = '/games/boards/snake-and-ladder.png';
// Playable 10x10 grid inside the board image (594 x 600 px): x 18-580, y 20-580
const GRID = { left: 18 / 594, top: 20 / 600, width: 562 / 594, height: 560 / 600 };

export const RINGS = [
  { name: 'Red', color: '#FF0000' },
  { name: 'Yellow', color: '#FFD700' },
  { name: 'Green', color: '#00FF55' },
  { name: 'Blue', color: '#0015FF' },
  { name: 'Cyan', color: '#00FFFF' },
  { name: 'Magenta', color: '#FF00FF' },
];

// Offsets (in cell fractions) so rings sharing a square stay visible
const CLUSTER = [[0, 0], [-0.22, -0.22], [0.22, 0.22], [0.22, -0.22], [-0.22, 0.22], [0, 0.28]];
// 5-6 rings on one square: two rows of three so every ring stays visible
const CLUSTER_SIX = [[-0.32, -0.18], [0, -0.18], [0.32, -0.18], [-0.32, 0.18], [0, 0.18], [0.32, 0.18]];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Centre of a square (1-100) as a percentage of the grid, following the zig-zag numbering */
function squareXY(sq: number) {
  const row = Math.floor((sq - 1) / 10);
  const i = (sq - 1) % 10;
  const col = row % 2 === 0 ? i : 9 - i;
  return { x: (col + 0.5) * 10, y: (9 - row + 0.5) * 10 };
}

function walkPath(m: SnakeAndLadderLastMove) {
  const path: number[] = [];
  let sq = m.from;
  const peak = m.bounced ? SNAKE_AND_LADDER_FINISH : m.landed;
  while (sq < peak) path.push(++sq);
  while (sq > m.landed) path.push(--sq);
  return path;
}

function describe(s: SnakeAndLadderState) {
  const m = s.lastMove;
  if (!m) return 'Press Play to throw the dice.';
  const who = s.players[m.playerIndex].name;
  if (m.kind === 'forfeit') return `${who} rolled a third 6 in a row — roll forfeited, turn over.`;
  let text = `${who} rolled ${m.roll}`;
  if (m.bounced) text += `, bounced back off 100 to ${m.landed}`;
  else text += ` and moved to ${m.landed}`;
  if (m.kind === 'ladder') text += ` — climbed a ladder to ${m.to}! 🪜`;
  if (m.kind === 'snake') text += ` — bitten by a snake, slid down to ${m.to}! 🐍`;
  if (s.status === 'finished') return `${text} 🏆`;
  if (m.extraTurn) text += '. Rolled a 6 — roll again!';
  return text;
}

type Mode = 'local' | 'online';
type Players = SnakeAndLadderState['players'];
interface Seat { name: string; ai: boolean }
interface DiceDrop { id: number; value: number; fast: boolean }

export default function SnakeAndLadderGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('local');
  // A shared room link opens straight into online play.
  useEffect(() => { const q = new URLSearchParams(location.search); if (q.has('room') || q.has('online')) setMode('online'); }, []);
  return (
    <Shell onBack={onBack}>
      <div role="tablist" aria-label="How to play" className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-bg/60 p-1">
        {([['local', 'This device', 'users'], ['online', 'Online', 'globe']] as const).map(([m, label, icon]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-surface text-primary shadow-soft' : 'text-muted'}`}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>
      {mode === 'online' ? <ConvexRoomProvider><OnlineLadder /></ConvexRoomProvider> : <LocalLadder />}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* The dice throw and ring walk, shared by local and online play        */
/* ------------------------------------------------------------------ */

/** Rings are drawn from `display`, which trails the game state while a roll plays out. */
function useRollAnimation() {
  const [display, setDisplay] = useState<number[]>([]);
  const [sliding, setSliding] = useState<number | null>(null);
  const [dice, setDice] = useState<DiceDrop | null>(null);
  const runRef = useRef(0);
  useEffect(() => () => { runRef.current++; }, []);

  /** Stop any roll in progress */
  const cancel = useCallback(() => { runRef.current++; }, []);
  /** Stop any roll in progress and put the rings straight on these squares */
  const snap = useCallback((positions: number[]) => {
    runRef.current++;
    setDisplay(positions); setDice(null); setSliding(null);
  }, []);

  /** Throw the dice and walk the ring to where `next` says. False if cancelled on the way. `fast` when more rolls are waiting. */
  const animate = useCallback(async (next: SnakeAndLadderState, fast = false) => {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    const m = next.lastMove!;
    setDice({ id: Date.now(), value: m.roll, fast }); // thrown with physics; it always lands on the rolled number
    await sleep(fast ? 700 : 1100);
    for (const sq of walkPath(m)) {
      if (!alive()) return false;
      setDisplay((d) => d.map((p, i) => (i === m.playerIndex ? sq : p)));
      await sleep(fast ? 140 : 260);
    }
    if (m.to !== m.landed) {
      await sleep(250);
      if (!alive()) return false;
      setSliding(m.playerIndex);
      setDisplay((d) => d.map((p, i) => (i === m.playerIndex ? m.to : p)));
      await sleep(950);
    }
    if (!alive()) return false;
    setSliding(null);
    setDisplay(next.playerPositions);
    return true;
  }, []);

  return { display, sliding, dice, cancel, snap, animate };
}

/* ------------------------------------------------------------------ */
/* Local: bots and people sharing one phone                             */
/* ------------------------------------------------------------------ */

function LocalLadder() {
  const [seats, setSeats] = useState<Seat[]>([{ name: 'Player 1', ai: false }, { name: 'Bot 2', ai: true }]);
  const [game, setGame] = useState<SnakeAndLadderState | null>(null);
  const [saved, setSaved] = useState<SnakeAndLadderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const { display, sliding, dice, cancel, snap, animate } = useRollAnimation();

  useEffect(() => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const s = engine.deserialize(raw);
      if (s.status === 'playing' && Array.isArray(s.playerPositions) && s.players.length <= RINGS.length) setSaved(s);
    } catch { localStorage.removeItem(SAVE_KEY); }
  }, []);

  const begin = (s: SnakeAndLadderState) => {
    snap(s.playerPositions);
    setGame(s); setBusy(false);
    setLog(s.lastMove ? [describe(s)] : []);
    localStorage.setItem(SAVE_KEY, engine.serialize(s));
  };

  const start = () => begin(engine.initialize(
    seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || RINGS[i].name, s.ai, s.ai ? 'medium' : undefined)),
  ));

  const play = useCallback(async () => {
    if (!game || busy || game.status !== 'playing') return;
    const next = engine.applyMove(game, rollDie());
    setBusy(true);
    if (!(await animate(next))) return;
    setGame(next);
    setLog((l) => [describe(next), ...l].slice(0, 6));
    if (next.status === 'finished') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, engine.serialize(next));
    setBusy(false);
  }, [game, busy, animate]);

  const botTurn = !!game && game.status === 'playing' && game.players[game.currentPlayerIndex].isAI;
  useEffect(() => {
    if (!botTurn || busy) return;
    const t = setTimeout(play, 900);
    return () => clearTimeout(t);
  }, [botTurn, busy, play]);

  const resize = (n: number) => setSeats((s) => Array.from({ length: n }, (_, i) => s[i] ?? { name: `Player ${i + 1}`, ai: false }));
  const updateSeat = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  useEndSfx(game?.status === 'finished');
  if (!game) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-semibold">
            Players:
            <select value={seats.length} onChange={(e) => resize(Number(e.target.value))} className="ml-2 field">
              {Array.from({ length: SNAKE_AND_LADDER_MANIFEST.maxPlayers - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <p className="text-sm text-muted">Pass the device around, or fill seats with bots.</p>
        </div>
        <ul className="space-y-2">
          {seats.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="sl-ring h-7 w-7 shrink-0" style={{ backgroundColor: RINGS[i].color }} title={`${RINGS[i].name} ring`} />
              <input value={s.name} maxLength={20} onChange={(e) => updateSeat(i, { name: e.target.value })}
                className="field min-w-0 flex-1" aria-label={`${RINGS[i].name} ring player name`} />
              <select value={s.ai ? 'ai' : 'human'} onChange={(e) => updateSeat(i, { ai: e.target.value === 'ai' })}
                className="field" aria-label={`${RINGS[i].name} ring player type`}>
                <option value="human">Human</option>
                <option value="ai">Bot</option>
              </select>
            </li>
          ))}
        </ul>
        <SnakeAndLadderRulebook open />
        <button onClick={start} className="btn btn-primary w-full">I&apos;ve read the rules — Start Game</button>
        {saved && <button onClick={() => begin(saved)} className="btn btn-outline w-full">Resume saved game</button>}
      </>
    );
  }

  const finished = game.status === 'finished' && game.winner !== null;
  const current = game.players[game.currentPlayerIndex];
  const ringNow = finished ? -1 : game.currentPlayerIndex;

  return (
    <>
      <LadderBoard players={game.players} display={display} sliding={sliding} dice={dice} current={ringNow} />

      <p className="min-h-6 text-center font-semibold" aria-live="polite">{busy ? 'Rolling…' : log[0] ?? describe(game)}</p>

      <PlayerList players={game.players} display={display} current={ringNow} />

      {finished && !busy ? (
        <div className="rounded-lg border-2 border-accent p-4 text-center">
          <h2 className="text-xl font-bold">🏆 {game.players[game.winner!].name} ({RINGS[game.winner!].name}) wins!</h2>
          <button onClick={start} className="btn btn-primary mt-2">Play Again</button>
        </div>
      ) : (
        <button onClick={play} disabled={busy || botTurn} className="btn btn-primary w-full text-lg disabled:opacity-50">
          {busy ? 'Rolling…' : botTurn ? `${current.name} is rolling…` : `▶ Play — ${current.name} (${RINGS[game.currentPlayerIndex].name})`}
        </button>
      )}

      <RollLog log={log} />

      <div className="flex gap-2">
        <button onClick={start} className="btn btn-outline flex-1">Restart</button>
        <button onClick={() => { cancel(); setGame(null); setSaved(game.status === 'playing' ? game : null); }} className="btn btn-outline flex-1">Change players</button>
        <button onClick={() => setShowRules((v) => !v)} className="btn btn-outline flex-1">{showRules ? 'Hide rules' : 'Rulebook'}</button>
      </div>
      {showRules && <SnakeAndLadderRulebook open />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Online: the server rolls for everyone; we replay each roll it sends  */
/* ------------------------------------------------------------------ */

function OnlineLadder() {
  const room = useRoom('snake-and-ladder');
  const v = room.view;
  const state = (v?.state ?? null) as SnakeAndLadderState | null;
  const seat = v?.me?.seat ?? -1;
  const { display, sliding, dice, snap, animate } = useRollAnimation();
  // `shown` is the state the board has caught up to; it trails `state` while rolls play out.
  const [shown, setShown] = useState<SnakeAndLadderState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [rolling, setRolling] = useState(false);
  const [arrivedOver, setArrivedOver] = useState(false); // no fanfare for a game that was already over when we opened it
  const queue = useRef<SnakeAndLadderState[]>([]);
  const working = useRef(false);
  const gameKey = useRef<number | null>(null); // createdAt of the game on the board
  const rollKey = useRef(0); // updatedAt of the newest roll taken in
  // Leaving online play drops any rolls still waiting, so no dice sounds play after.
  useEffect(() => { const q = queue.current; return () => { q.length = 0; }; }, []);

  // Replay every roll in order, so everyone sees every throw: their own, other people's and the bots'.
  const pump = useCallback(async () => {
    if (working.current) return;
    working.current = true; setRolling(true);
    const q = queue.current;
    while (q.length) {
      // Bots roll faster than rings walk: when far behind, jump to the newest roll (the log still gets every line).
      const behind = q.length > 2 ? q.splice(0, q.length - 1) : [];
      if (behind.length) {
        snap(behind[behind.length - 1].playerPositions);
        setLog((l) => [...behind.map(describe).reverse(), ...l].slice(0, 6));
      }
      const next = q.shift()!;
      if (!(await animate(next, q.length > 0))) continue; // a new game started meanwhile
      setShown(next);
      setLog((l) => [describe(next), ...l].slice(0, 6));
    }
    working.current = false; setRolling(false);
  }, [snap, animate]);

  useEffect(() => {
    if (!state) { gameKey.current = null; return; }
    if (state.createdAt !== gameKey.current) {
      // A new game, or we just arrived: show it as it stands
      gameKey.current = state.createdAt; rollKey.current = state.updatedAt;
      setArrivedOver(state.status === 'finished');
      queue.current.length = 0;
      snap(state.playerPositions); setShown(state);
      setLog(state.lastMove ? [describe(state)] : []);
      return;
    }
    if (state.updatedAt === rollKey.current) {
      // Same roll, new details (a bot took over a seat that was left)
      if (!working.current) setShown(state);
      return;
    }
    rollKey.current = state.updatedAt;
    if (!state.lastMove) { snap(state.playerPositions); setShown(state); return; }
    queue.current.push(state);
    pump();
  }, [state, snap, pump]);

  const board = state && shown && shown.createdAt === state.createdAt ? shown : null;
  const finished = !!board && board.status === 'finished' && board.winner !== null;
  useEndSfx(finished && !arrivedOver,seat >= 0 && board?.winner !== seat);

  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && state?.status === 'playing';
  const caughtUp = !!board && board.updatedAt === state!.updatedAt && !rolling;
  const myTurn = caughtUp && seat >= 0 && state!.status === 'playing' && state!.currentPlayerIndex === seat && !room.busy;
  const ringNow = !board || finished ? -1 : board.currentPlayerIndex;
  const current = board?.players[board.currentPlayerIndex];

  return (
    <div className="space-y-4">
      <VoiceChat room={room} />
      {room.joined && board && (
        <>
          <LadderBoard players={board.players} display={display} sliding={sliding} dice={dice} current={ringNow} />

          <p className="min-h-6 text-center font-semibold" aria-live="polite">{rolling ? 'Rolling…' : log[0] ?? describe(board)}</p>

          <PlayerList players={board.players} display={display} current={ringNow} me={seat} />

          {finished ? (
            <div className="rounded-lg border-2 border-accent p-4 text-center">
              <h2 className="text-xl font-bold">🏆 {board.winner === seat ? 'You win!' : `${board.players[board.winner!].name} (${RINGS[board.winner!].name}) wins!`}</h2>
              <p className="text-sm text-muted">The host can start a new game below.</p>
            </div>
          ) : seat < 0 ? (
            <p className="rounded-lg bg-bg/60 p-3 text-center text-sm font-semibold text-muted">You&apos;re watching this game. You can play in the next one.</p>
          ) : (
            <button onClick={() => { room.move({ type: 'roll' }); }} disabled={!myTurn} className="btn btn-primary w-full text-lg disabled:opacity-50">
              {myTurn ? `▶ Play — You (${RINGS[seat].name})`
                : !caughtUp || room.busy ? 'Rolling…'
                : current!.isAI ? `${current!.name} is rolling…` : `Waiting for ${current!.name}…`}
            </button>
          )}

          <RollLog log={log} />
        </>
      )}
      {playing && <JoinRequests room={room} />}
      {room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>}
      {!playing && <RoomLobby room={room} title={SNAKE_AND_LADDER_MANIFEST.name} maxSeats={SNAKE_AND_LADDER_MANIFEST.maxPlayers} />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm(seat >= 0 ? 'Leave this game? A bot will take your seat.' : 'Stop watching this game?')) room.leave(); }}><Icon name="logout" size={18} />Leave game</button>}
      <SnakeAndLadderRulebook />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The board, rings and players: same for every mode                    */
/* ------------------------------------------------------------------ */

/** `current` is the ring whose turn it is (-1 once the game is over) */
function LadderBoard({ players, display, sliding, dice, current }: {
  players: Players; display: number[]; sliding: number | null; dice: DiceDrop | null; current: number;
}) {
  const [boardPx, setBoardPx] = useState(500);
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoardPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const diceSize = Math.max(40, boardPx * 0.11);
  const offBoard = display.map((p, i) => [p, i] as const).filter(([p]) => p === 0);

  return (
    <>
      <div ref={boardRef} className="relative mx-auto w-full max-w-[600px] select-none" style={{ aspectRatio: '594 / 600' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BOARD_IMG} alt="Snake and Ladder board" className="absolute inset-0 h-full w-full rounded-xl" draggable={false} />
        <div className="absolute" style={{ left: `${GRID.left * 100}%`, top: `${GRID.top * 100}%`, width: `${GRID.width * 100}%`, height: `${GRID.height * 100}%` }}>
          {display.map((sq, i) => {
            if (sq === 0) return null;
            const { x, y } = squareXY(sq);
            const here = display.map((p, j) => [p, j] as const).filter(([p]) => p === sq).map(([, j]) => j);
            const crowd = here.length > 1;
            const packed = here.length > 4;
            const [dx, dy] = crowd ? (packed ? CLUSTER_SIX : CLUSTER)[here.indexOf(i)] : [0, 0];
            const size = packed ? 3.4 : crowd ? 4.6 : 6;
            const isCurrent = i === current;
            return (
              <div key={i} title={`${players[i].name} (${RINGS[i].name}) — square ${sq}`}
                className={`sl-ring absolute ${isCurrent ? 'sl-ring-current' : ''}`}
                style={{
                  left: `${x + dx * 10}%`, top: `${y + dy * 10}%`, transform: 'translate(-50%, -50%)',
                  width: `${size}%`, height: `${size}%`,
                  backgroundColor: RINGS[i].color,
                  zIndex: isCurrent ? 30 : 20,
                  transition: sliding === i ? 'left 900ms ease-in-out, top 900ms ease-in-out' : 'left 200ms ease-out, top 200ms ease-out',
                }} />
            );
          })}
        </div>
        {dice && boardPx > 0 && (
          <DiceTray className="pointer-events-none !absolute inset-0 z-40" values={[dice.value]} rollKey={dice.id} size={diceSize}
            height={(boardPx * 600) / 594} duration={dice.fast ? 0.65 : 1} tilt={0} />
        )}
      </div>

      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border-2 border-border p-2 text-sm">
        <span className="font-semibold">Start zone:</span>
        {offBoard.length === 0 ? <span className="text-muted">empty</span> : offBoard.map(([, i]) => (
          <span key={i} className="sl-ring h-6 w-6" style={{ backgroundColor: RINGS[i].color }} title={players[i].name} />
        ))}
      </div>
    </>
  );
}

/** `me` marks your own ring online (-1 locally, or when watching) */
function PlayerList({ players, display, current, me = -1 }: { players: Players; display: number[]; current: number; me?: number }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {players.map((p, i) => (
        <li key={p.id} className={`flex items-center justify-between gap-2 rounded-lg border-2 p-2 text-sm font-bold ${i === current ? 'border-primary' : 'border-border'}`}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="sl-ring h-5 w-5 shrink-0" style={{ backgroundColor: RINGS[i].color }} />
            <span className="truncate">{p.name}{p.isAI && ' 🤖'}{i === me && ' (you)'}</span>
          </span>
          <span className="shrink-0">{display[i] === 0 ? 'Start' : `Square ${display[i]}`}</span>
        </li>
      ))}
    </ul>
  );
}

function RollLog({ log }: { log: string[] }) {
  if (log.length <= 1) return null;
  return (
    <ol className="space-y-1 text-sm text-muted">
      {log.slice(1).map((l, i) => <li key={i}>{l}</li>)}
    </ol>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={onBack} className="back-link">← Back to Snake &amp; Ladder</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>🐍 {SNAKE_AND_LADDER_MANIFEST.name} 🪜</h1>
        {children}
      </div>
    </main>
  );
}
