'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SnakeAndLadderEngine, SNAKE_AND_LADDER_MANIFEST, SNAKE_AND_LADDER_FINISH, createPlayer, rollDie,
  type SnakeAndLadderState, type SnakeAndLadderLastMove,
} from '@slgh/shared';
import SnakeAndLadderRulebook from './SnakeAndLadderRulebook';
import Die3D from './Die3D';
import { sfx } from '@/lib/sound';
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

interface Seat { name: string; ai: boolean }
interface DiceDrop { id: number; value: number; x: number; y: number }

export default function SnakeAndLadderGame({ onBack }: { onBack: () => void }) {
  const [seats, setSeats] = useState<Seat[]>([{ name: 'Player 1', ai: false }, { name: 'Bot 2', ai: true }]);
  const [game, setGame] = useState<SnakeAndLadderState | null>(null);
  const [saved, setSaved] = useState<SnakeAndLadderState | null>(null);
  const [display, setDisplay] = useState<number[]>([]);
  const [sliding, setSliding] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dice, setDice] = useState<DiceDrop | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [boardPx, setBoardPx] = useState(500);
  const boardRef = useRef<HTMLDivElement>(null);
  const runRef = useRef(0);

  useEffect(() => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const s = engine.deserialize(raw);
      if (s.status === 'playing' && Array.isArray(s.playerPositions) && s.players.length <= RINGS.length) setSaved(s);
    } catch { localStorage.removeItem(SAVE_KEY); }
  }, []);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoardPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [game !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { runRef.current++; }, []);

  const begin = (s: SnakeAndLadderState) => {
    runRef.current++;
    setGame(s); setDisplay(s.playerPositions); setDice(null); setBusy(false); setSliding(null);
    setLog(s.lastMove ? [describe(s)] : []);
    localStorage.setItem(SAVE_KEY, engine.serialize(s));
  };

  const start = () => begin(engine.initialize(
    seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || RINGS[i].name, s.ai, s.ai ? 'medium' : undefined)),
  ));

  const play = useCallback(async () => {
    if (!game || busy || game.status !== 'playing') return;
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    const value = rollDie();
    const next = engine.applyMove(game, value);
    const m = next.lastMove!;
    sfx('dice');
    setBusy(true);
    setDice({ id: Date.now(), value, x: 25 + Math.random() * 50, y: 25 + Math.random() * 50 });
    await sleep(1100);
    for (const sq of walkPath(m)) {
      if (!alive()) return;
      setDisplay((d) => d.map((p, i) => (i === m.playerIndex ? sq : p)));
      await sleep(260);
    }
    if (m.to !== m.landed) {
      await sleep(250);
      if (!alive()) return;
      setSliding(m.playerIndex);
      setDisplay((d) => d.map((p, i) => (i === m.playerIndex ? m.to : p)));
      await sleep(950);
    }
    if (!alive()) return;
    setSliding(null);
    setDisplay(next.playerPositions);
    setGame(next);
    setLog((l) => [describe(next), ...l].slice(0, 6));
    if (next.status === 'finished') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, engine.serialize(next));
    setBusy(false);
  }, [game, busy]);

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
      <Shell onBack={onBack}>
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
      </Shell>
    );
  }

  const finished = game.status === 'finished' && game.winner !== null;
  const current = game.players[game.currentPlayerIndex];
  const diceSize = Math.max(40, boardPx * 0.11);
  const offBoard = display.map((p, i) => [p, i] as const).filter(([p]) => p === 0);

  return (
    <Shell onBack={onBack}>
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
            const isCurrent = !finished && i === game.currentPlayerIndex;
            return (
              <div key={i} title={`${game.players[i].name} (${RINGS[i].name}) — square ${sq}`}
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
        {dice && (
          <div key={dice.id} className="sl-die-drop absolute z-40" style={{ left: `${dice.x}%`, top: `${dice.y}%`, marginLeft: -diceSize / 2, marginTop: -diceSize / 2 }}>
            <Die3D value={dice.value} size={diceSize} />
          </div>
        )}
      </div>

      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border-2 border-border p-2 text-sm">
        <span className="font-semibold">Start zone:</span>
        {offBoard.length === 0 ? <span className="text-muted">empty</span> : offBoard.map(([, i]) => (
          <span key={i} className="sl-ring h-6 w-6" style={{ backgroundColor: RINGS[i].color }} title={game.players[i].name} />
        ))}
      </div>

      <p className="min-h-6 text-center font-semibold" aria-live="polite">{busy ? 'Rolling…' : log[0] ?? describe(game)}</p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {game.players.map((p, i) => (
          <li key={p.id} className={`flex items-center justify-between rounded-lg border-2 p-2 text-sm font-bold ${i === game.currentPlayerIndex && !finished ? 'border-primary' : 'border-border'}`}>
            <span className="flex items-center gap-2">
              <span className="sl-ring h-5 w-5" style={{ backgroundColor: RINGS[i].color }} />
              {p.name}{p.isAI && ' 🤖'}
            </span>
            <span>{display[i] === 0 ? 'Start' : `Square ${display[i]}`}</span>
          </li>
        ))}
      </ul>

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

      {log.length > 1 && (
        <ol className="space-y-1 text-sm text-muted">
          {log.slice(1).map((l, i) => <li key={i}>{l}</li>)}
        </ol>
      )}

      <div className="flex gap-2">
        <button onClick={start} className="btn btn-outline flex-1">Restart</button>
        <button onClick={() => { runRef.current++; setGame(null); setSaved(game.status === 'playing' ? game : null); }} className="btn btn-outline flex-1">Change players</button>
        <button onClick={() => setShowRules((v) => !v)} className="btn btn-outline flex-1">{showRules ? 'Hide rules' : 'Rulebook'}</button>
      </div>
      {showRules && <SnakeAndLadderRulebook open />}
    </Shell>
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
