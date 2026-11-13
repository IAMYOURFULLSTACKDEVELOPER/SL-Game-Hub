'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckersEngine, CHECKERS_RULES, createPlayer, type CheckersState, type CheckersMove, type Difficulty } from '@slgh/shared';
import Rulebook from './Rulebook';
import { RoomLobby, JoinRequests } from './RoomLobby';
import { VoiceChat } from './VoiceChat';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { useRoom, type RoomApi } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new CheckersEngine();
const SAVE_KEY = 'checkers_game_state_v2';
const FILES = 'ABCDEFGH';
type Mode = 'bot' | 'local' | 'online';
type OnlineMove = Extract<Parameters<RoomApi['move']>[0], { type: 'checkers' }>;
interface Saved { history: CheckersState[]; mode: Mode; difficulty: Difficulty; result: string | null }

const NAME = { red: 'Red', black: 'Black' } as const;

export default function CheckersGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('bot');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [history, setHistory] = useState<CheckersState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<CheckersMove | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  const game = history.at(-1) ?? null;

  // A shared room link opens straight into online play.
  useEffect(() => { const q = new URLSearchParams(location.search); if (q.has('room') || q.has('online')) setMode('online'); }, []);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '') as Saved;
      if (s.history?.length && s.history.at(-1)!.status === 'playing' && !s.result) setSaved(s);
    } catch { /* no save */ }
  }, []);
  useEffect(() => {
    if (!game) return;
    if (game.status === 'playing' && !result) localStorage.setItem(SAVE_KEY, JSON.stringify({ history: history.slice(-60), mode, difficulty, result } satisfies Saved));
    else localStorage.removeItem(SAVE_KEY);
  }, [history, mode, difficulty, result, game]);

  const start = () => {
    const players = mode === 'bot'
      ? [createPlayer('you', 'You (Red)'), createPlayer('bot', `Bot (${difficulty})`, true, difficulty)]
      : [createPlayer('p1', 'Red player'), createPlayer('p2', 'Black player')];
    setHistory([engine.initialize(players)]); setSelected(null); setLastMove(null); setResult(null);
  };

  const legal = useMemo(() => (game && game.status === 'playing' ? engine.getLegalMoves(game) : []), [game]);
  useEndSfx(!!game && (game.status === 'finished' || !!result));

  const play = (m: CheckersMove) => {
    if (!game) return;
    const next = engine.applyMove(game, m);
    sfx(m.isJump ? 'capture' : 'move');
    setHistory((h) => [...h, next]);
    setLastMove(m);
    setSelected(next.jumpingFrom != null ? next.jumpingFrom : null);
  };

  const botTurn = !!game && game.status === 'playing' && !result && game.players[game.currentPlayerIndex].isAI;
  useEffect(() => {
    if (!botTurn || !game) return;
    const t = setTimeout(() => play(engine.getAIMove(game, game.players[game.currentPlayerIndex].difficulty ?? 'medium')), 650);
    return () => clearTimeout(t);
  }, [botTurn, game]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setMode('bot')} className={`btn btn-sm ${mode === 'bot' ? 'btn-primary' : 'btn-outline'}`}>🤖 vs Bot</button>
      <button onClick={() => setMode('local')} className={`btn btn-sm ${mode === 'local' ? 'btn-primary' : 'btn-outline'}`}>👥 2 players (this device)</button>
      <button onClick={() => setMode('online')} className={`btn btn-sm ${mode === 'online' ? 'btn-primary' : 'btn-outline'}`}>🌐 Online</button>
    </div>
  );

  // Online games live on the server; the local game state above stays empty.
  if (mode === 'online') {
    return (
      <Shell onBack={onBack}>
        {tabs}
        <ConvexRoomProvider><OnlineCheckers /></ConvexRoomProvider>
        <Rulebook title="Checkers Rulebook" sections={CHECKERS_RULES} />
      </Shell>
    );
  }

  if (!game) {
    return (
      <Shell onBack={onBack}>
        {tabs}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/boards/checkers.jpg" alt="Premium wooden checkers board" className="w-full rounded-xl" />
        {mode === 'bot' && (
          <label className="block text-sm font-semibold">Bot level:
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="ml-2 field">
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </label>
        )}
        <button onClick={start} className="btn btn-primary w-full">🔴 Start game</button>
        {saved && <button onClick={() => { setMode(saved.mode); setDifficulty(saved.difficulty); setHistory(saved.history); setResult(saved.result); }} className="btn btn-outline w-full">Resume saved game</button>}
        <Rulebook title="Checkers Rulebook" sections={CHECKERS_RULES} open />
      </Shell>
    );
  }

  const over = game.status === 'finished' || !!result;
  const status = result ?? (game.status === 'finished'
    ? game.winner === null ? 'Draw — 40 moves each without a capture 🤝' : `🏆 ${NAME[game.winner === 0 ? 'red' : 'black']} wins!`
    : botTurn ? 'Bot is thinking…'
      : `${NAME[game.currentTurn]} to move${game.jumpingFrom != null ? ' — keep jumping!' : game.mustJump ? ' — you must capture!' : ''}`);
  const movable = new Set(legal.map((m) => m.from));
  const targets = selected !== null ? legal.filter((m) => m.from === selected) : [];

  const click = (i: number) => {
    if (over || botTurn) return;
    const m = targets.find((t) => t.to === i);
    if (m) { play(m); return; }
    if (game.jumpingFrom != null) return;
    setSelected(movable.has(i) ? i : null);
  };
  const undo = () => {
    // step back to the start of the human's previous turn
    let h = history.slice(0, -1);
    if (mode === 'bot') while (h.length > 1 && (h.at(-1)!.players[h.at(-1)!.currentPlayerIndex].isAI || h.at(-1)!.jumpingFrom != null)) h = h.slice(0, -1);
    setHistory(h.length ? h : history.slice(0, 1)); setSelected(null); setLastMove(null); setResult(null);
  };

  return (
    <Shell onBack={onBack}>
      <div className="flex justify-between text-sm font-bold">
        <span>⚫ Black: {game.blackPieces} pieces</span>
        <span>🔴 Red: {game.redPieces} pieces</span>
      </div>
      <CheckersBoard game={game} flipped={false} selected={selected} targets={targets} movable={movable} lastMove={lastMove} over={over} onSquare={click} />
      <p className="text-center text-lg font-bold" aria-live="polite">{status}</p>
      {over ? <button onClick={start} className="btn btn-primary w-full">Play again</button> : (
        <div className="flex flex-wrap gap-2">
          <button onClick={undo} disabled={history.length < 2 || botTurn} className="btn btn-outline flex-1 disabled:opacity-50">↶ Undo</button>
          <button onClick={() => {
            if (!window.confirm(mode === 'bot' ? 'Offer a draw? The bot accepts if pieces are level.' : 'Do both players agree to a draw?')) return;
            if (mode === 'local' || game.redPieces === game.blackPieces) setResult('Draw agreed 🤝'); else window.alert('The bot declines the draw.');
          }} className="btn btn-outline flex-1">🤝 Offer draw</button>
          <button onClick={() => {
            const loser = mode === 'bot' ? 'red' : game.currentTurn;
            if (window.confirm(`${NAME[loser]} resigns?`)) setResult(`${NAME[loser]} resigned — ${NAME[loser === 'red' ? 'black' : 'red']} wins 🏆`);
          }} className="btn btn-outline flex-1">🏳 Resign</button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={start} className="btn btn-outline flex-1">Restart</button>
        <button onClick={() => { setHistory([]); setSaved(null); }} className="btn btn-outline flex-1">New setup</button>
      </div>
      <Rulebook title="Checkers Rulebook" sections={CHECKERS_RULES} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Online: the server referees every move and plays the bots            */
/* ------------------------------------------------------------------ */

function OnlineCheckers() {
  const room = useRoom('checkers');
  const v = room.view;
  const game = (v?.state ?? null) as CheckersState | null;
  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && game?.status === 'playing';
  return (
    <div className="space-y-4">
      <VoiceChat room={room} />
      {room.joined && game && <OnlineCheckersTable game={game} seat={v?.me?.seat ?? -1} busy={room.busy} onMove={(m) => { room.move(m); }} />}
      {playing && <JoinRequests room={room} />}
      {room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>}
      {!playing && <RoomLobby room={room} title="Checkers" maxSeats={2} />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm('Leave this game? A bot will take your seat.')) room.leave(); }}><Icon name="logout" size={18} />Leave game</button>}
    </div>
  );
}

/** Seat 0 plays Red, seat 1 Black. Each player sees their own pieces at the bottom; spectators see Red's side. */
function OnlineCheckersTable({ game, seat, busy, onMove }: { game: CheckersState; seat: number; busy: boolean; onMove: (m: OnlineMove) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<CheckersMove | null>(null);
  const over = game.status === 'finished';
  const myTurn = seat >= 0 && game.status === 'playing' && game.currentPlayerIndex === seat && !busy;

  // The server only sends positions: work out which move was just played, for the highlight and the sound.
  const key = game.board.join(',');
  const prev = useRef<CheckersState | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    setSelected(null);
    const m = before?.status === 'playing' ? engine.getLegalMoves(before).find((x) => engine.applyMove(before, x).board.join(',') === key) : undefined;
    setLastMove(m ?? null);
    if (m) sfx(m.isJump ? 'capture' : 'move');
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEndSfx(over, seat >= 0 && game.winner !== null && game.winner !== seat);

  const legal = useMemo(() => (myTurn ? engine.getLegalMoves(game) : []), [game, myTurn]);
  const movable = new Set(legal.map((m) => m.from));
  // Mid multi-jump the same piece must keep going: one hop is sent per move
  const sel = game.jumpingFrom != null ? game.jumpingFrom : selected;
  const targets = sel !== null ? legal.filter((m) => m.from === sel) : [];

  const click = (i: number) => {
    if (!myTurn) return;
    const m = targets.find((t) => t.to === i);
    if (m) { onMove({ type: 'checkers', from: m.from, to: m.to }); setSelected(null); return; }
    if (game.jumpingFrom != null) return;
    setSelected(movable.has(i) ? i : null);
  };

  const colorOf = (i: number) => (i === 0 ? 'red' : 'black');
  const who = (i: number) => (i === seat ? 'You' : `${game.players[i]?.name ?? 'Player'} (${NAME[colorOf(i)]})`);
  const turn = game.currentPlayerIndex;
  const status = over
    ? game.winner === null ? 'Draw — 40 moves each without a capture 🤝' : `🏆 ${who(game.winner)} ${game.winner === seat ? 'win' : 'wins'}!`
    : game.players[turn]?.isAI ? `${who(turn)} is thinking…`
      : turn === seat ? `Your move (${NAME[game.currentTurn]})${game.jumpingFrom != null ? ' — keep jumping!' : game.mustJump ? ' — you must capture!' : ''}`
        : `${who(turn)} to move`;

  const flipped = seat === 1;
  const [top, bottom] = flipped ? [0, 1] : [1, 0];
  const tag = (i: number) => (
    <p className="flex items-center gap-2 text-sm font-bold">
      <span aria-hidden>{i === 0 ? '🔴' : '⚫'}</span>
      <span className="min-w-0 truncate">{game.players[i]?.name ?? NAME[colorOf(i)]}{i === seat ? ' (you)' : ''}</span>
      <span className="shrink-0 font-normal text-muted">{i === 0 ? game.redPieces : game.blackPieces} pieces</span>
      {!over && turn === i && <span className="chip chip-primary ml-auto shrink-0">To move</span>}
    </p>
  );

  return (
    <div className="space-y-3">
      {tag(top)}
      <CheckersBoard game={game} flipped={flipped} selected={sel} targets={targets} movable={movable} lastMove={lastMove} over={over} onSquare={click} />
      {tag(bottom)}
      <p className="text-center text-lg font-bold" aria-live="polite">{status}</p>
      {seat < 0 && <p className="text-center text-sm text-muted">You are watching this game.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The board, shared by every mode                                      */
/* ------------------------------------------------------------------ */

function CheckersBoard({ game, flipped, selected, targets, movable, lastMove, over, onSquare }: {
  game: CheckersState; flipped: boolean; selected: number | null; targets: CheckersMove[]; movable: Set<number>;
  lastMove: CheckersMove | null; over: boolean; onSquare: (i: number) => void;
}) {
  // Row 7 at the top so Red (rows 0-2) sits at the bottom, as on the board photo; flipped turns it round for Black
  const rows = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="checkers-frame mx-auto w-full max-w-[560px] select-none rounded-xl p-[5%]">
      <div className="relative grid grid-cols-8 overflow-hidden border-2 border-[#d9b15a]">
        {rows.map((r) => cols.map((c) => {
          const i = r * 8 + c;
          const dark = (r + c) % 2 === 1;
          const p = game.board[i];
          const target = targets.find((t) => t.to === i);
          const isLast = lastMove && (lastMove.from === i || lastMove.to === i);
          return (
            <button key={i} onClick={() => onSquare(i)} disabled={!dark}
              aria-label={`${FILES[c]}${r + 1}${p ? ` ${p.replace('_', ' ')}` : ''}`}
              className={`relative flex aspect-square items-center justify-center ${dark ? 'checkers-dark' : 'checkers-light'}`}>
              {isLast && <span className="absolute inset-0 bg-yellow-300/25" />}
              {selected === i && <span className="absolute inset-0 bg-emerald-400/40" />}
              {p && (
                <span className={`checkers-disc relative z-10 ${p.startsWith('red') ? 'checkers-red' : 'checkers-black'} ${game.mustJump && movable.has(i) && !over ? 'ring-4 ring-yellow-300' : ''}`}>
                  {p.endsWith('king') && <span className="text-[clamp(0.9rem,4vw,1.6rem)] text-yellow-300 drop-shadow">♛</span>}
                </span>
              )}
              {target && <span className={`absolute z-20 rounded-full ${target.isJump ? 'h-1/3 w-1/3 bg-red-400/90' : 'h-1/4 w-1/4 bg-emerald-400/90'}`} />}
              {c === cols[0] && <span className="absolute left-0.5 top-0 text-[10px] font-bold text-[#f3d9a4]">{r + 1}</span>}
              {r === rows[7] && <span className={`absolute bottom-0 right-1 text-[10px] font-bold ${dark ? 'text-[#f3d9a4]' : 'text-black/50'}`}>{FILES[c]}</span>}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={onBack} className="back-link">← Back to Checkers</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>🔴 Checkers</h1>
        {children}
      </div>
    </main>
  );
}
