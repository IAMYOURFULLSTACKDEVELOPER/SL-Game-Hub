'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckersEngine, CHECKERS_RULES, createPlayer, type CheckersState, type CheckersMove, type Difficulty } from '@slgh/shared';
import Rulebook from './Rulebook';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new CheckersEngine();
const SAVE_KEY = 'checkers_game_state_v2';
const FILES = 'ABCDEFGH';
type Mode = 'bot' | 'local';
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

  if (!game) {
    return (
      <Shell onBack={onBack}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/boards/checkers.jpg" alt="Premium wooden checkers board" className="w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode('bot')} className={`btn btn-sm ${mode === 'bot' ? 'btn-primary' : 'btn-outline'}`}>🤖 vs Bot</button>
          <button onClick={() => setMode('local')} className={`btn btn-sm ${mode === 'local' ? 'btn-primary' : 'btn-outline'}`}>👥 2 players (this device)</button>
        </div>
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

  // Display with row 7 at the top so Red (rows 0-2) sits at the bottom, as on the board photo
  const rows = [7, 6, 5, 4, 3, 2, 1, 0];
  return (
    <Shell onBack={onBack}>
      <div className="flex justify-between text-sm font-bold">
        <span>⚫ Black: {game.blackPieces} pieces</span>
        <span>🔴 Red: {game.redPieces} pieces</span>
      </div>
      <div className="checkers-frame mx-auto w-full max-w-[560px] select-none rounded-xl p-[5%]">
        <div className="relative grid grid-cols-8 overflow-hidden border-2 border-[#d9b15a]">
          {rows.map((r, displayRow) => Array.from({ length: 8 }, (_, c) => {
            const i = r * 8 + c;
            const dark = (r + c) % 2 === 1;
            const p = game.board[i];
            const target = targets.find((t) => t.to === i);
            const isLast = lastMove && (lastMove.from === i || lastMove.to === i);
            return (
              <button key={i} onClick={() => click(i)} disabled={!dark}
                aria-label={`${FILES[c]}${displayRow === 0 ? 8 : 8 - displayRow}${p ? ` ${p.replace('_', ' ')}` : ''}`}
                className={`relative flex aspect-square items-center justify-center ${dark ? 'checkers-dark' : 'checkers-light'}`}>
                {isLast && <span className="absolute inset-0 bg-yellow-300/25" />}
                {selected === i && <span className="absolute inset-0 bg-emerald-400/40" />}
                {p && (
                  <span className={`checkers-disc relative z-10 ${p.startsWith('red') ? 'checkers-red' : 'checkers-black'} ${game.mustJump && movable.has(i) && !over ? 'ring-4 ring-yellow-300' : ''}`}>
                    {p.endsWith('king') && <span className="text-[clamp(0.9rem,4vw,1.6rem)] text-yellow-300 drop-shadow">♛</span>}
                  </span>
                )}
                {target && <span className={`absolute z-20 rounded-full ${target.isJump ? 'h-1/3 w-1/3 bg-red-400/90' : 'h-1/4 w-1/4 bg-emerald-400/90'}`} />}
                {c === 0 && <span className="absolute left-0.5 top-0 text-[10px] font-bold text-[#f3d9a4]">{displayRow === 0 ? 8 : 8 - displayRow}</span>}
                {displayRow === 7 && <span className={`absolute bottom-0 right-1 text-[10px] font-bold ${dark ? 'text-[#f3d9a4]' : 'text-black/50'}`}>{FILES[c]}</span>}
              </button>
            );
          }))}
        </div>
      </div>
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
