'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChessEngine, CHESS_RULES, createPlayer,
  type ChessState, type ChessMove, type ChessPiece, type PieceType, type Difficulty,
} from '@slgh/shared';
import Rulebook from './Rulebook';

const engine = new ChessEngine();
const SAVE_KEY = 'chess_game_state_v2';
const FILES = 'ABCDEFGH';
const GLYPH: Record<PieceType, string> = { king: '♚\uFE0E', queen: '♛\uFE0E', rook: '♜\uFE0E', bishop: '♝\uFE0E', knight: '♞\uFE0E', pawn: '♟\uFE0E' };
const VALUE: Record<PieceType, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const SIDE = { white: 'Gold', black: 'Black' } as const;

type Mode = 'bot' | 'local';
interface Saved { history: ChessState[]; moves: string[]; mode: Mode; humanColor: 'white' | 'black'; difficulty: Difficulty; result: string | null }

const sq = (r: number, c: number) => `${FILES[c]}${8 - r}`.toLowerCase();
const notation = (s: ChessState, m: ChessMove) => {
  if (m.castle) return m.castle === 'kingside' ? 'O-O' : 'O-O-O';
  const p = s.board[m.from.row][m.from.col]!;
  const cap = s.board[m.to.row][m.to.col] || m.enPassant ? 'x' : '-';
  return `${p.type === 'pawn' ? '' : GLYPH[p.type]}${sq(m.from.row, m.from.col)}${cap}${sq(m.to.row, m.to.col)}${m.promotion ? `=${GLYPH[m.promotion]}` : ''}`;
};

export default function ChessGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('bot');
  const [humanColor, setHumanColor] = useState<'white' | 'black'>('white');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [history, setHistory] = useState<ChessState[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [promo, setPromo] = useState<ChessMove[] | null>(null);
  const [lastMove, setLastMove] = useState<ChessMove | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [thinking, setThinking] = useState(false);

  const game = history.at(-1) ?? null;

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '') as Saved;
      if (s.history?.length && s.history.at(-1)!.status === 'playing' && !s.result) setSaved(s);
    } catch { /* no save */ }
  }, []);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'playing' && !result) localStorage.setItem(SAVE_KEY, JSON.stringify({ history: history.slice(-40), moves, mode, humanColor, difficulty, result } satisfies Saved));
    else localStorage.removeItem(SAVE_KEY);
  }, [history, moves, mode, humanColor, difficulty, result, game]);

  const start = () => {
    const players = mode === 'bot'
      ? humanColor === 'white'
        ? [createPlayer('you', 'You'), createPlayer('bot', `Bot (${difficulty})`, true, difficulty)]
        : [createPlayer('bot', `Bot (${difficulty})`, true, difficulty), createPlayer('you', 'You')]
      : [createPlayer('p1', 'Gold player'), createPlayer('p2', 'Black player')];
    setHistory([engine.initialize(players)]); setMoves([]); setSelected(null); setLastMove(null); setResult(null); setPromo(null);
  };
  const resume = (s: Saved) => {
    setMode(s.mode); setHumanColor(s.humanColor); setDifficulty(s.difficulty);
    setHistory(s.history); setMoves(s.moves); setResult(s.result); setSelected(null); setLastMove(null);
  };

  const play = (m: ChessMove) => {
    if (!game) return;
    const next = engine.applyMove(game, m);
    setHistory((h) => [...h, next]);
    setMoves((ms) => [...ms, notation(game, m) + (next.checkmate ? '#' : next.inCheck ? '+' : '')]);
    setLastMove(m); setSelected(null); setPromo(null);
  };

  const legal = useMemo(() => (game && game.status === 'playing' ? engine.getLegalMoves(game) : []), [game]);
  const botTurn = !!game && game.status === 'playing' && !result && game.players[game.currentPlayerIndex].isAI;

  useEffect(() => {
    if (!botTurn || !game) return;
    setThinking(true);
    const t = setTimeout(() => {
      play(engine.getAIMove(game, game.players[game.currentPlayerIndex].difficulty ?? 'medium'));
      setThinking(false);
    }, 450);
    return () => { clearTimeout(t); setThinking(false); };
  }, [botTurn, game]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) {
    return (
      <Shell onBack={onBack}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/boards/chess.jpg" alt="Gold and black chess board" className="w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode('bot')} className={`btn btn-sm ${mode === 'bot' ? 'btn-primary' : 'btn-outline'}`}>🤖 vs Bot</button>
          <button onClick={() => setMode('local')} className={`btn btn-sm ${mode === 'local' ? 'btn-primary' : 'btn-outline'}`}>👥 2 players (this device)</button>
        </div>
        {mode === 'bot' && (
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <label>Play as:
              <select value={humanColor} onChange={(e) => setHumanColor(e.target.value as 'white' | 'black')} className="ml-2 rounded border px-2 py-1">
                <option value="white">Gold (moves first)</option><option value="black">Black</option>
              </select>
            </label>
            <label>Bot level:
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="ml-2 rounded border px-2 py-1">
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </label>
          </div>
        )}
        <button onClick={start} className="btn btn-primary w-full">♟ Start game</button>
        {saved && <button onClick={() => resume(saved)} className="btn btn-outline w-full">Resume saved game</button>}
        <Rulebook title="Chess Rulebook" sections={CHESS_RULES} open />
      </Shell>
    );
  }

  const flipped = mode === 'bot' && humanColor === 'black';
  const turnName = SIDE[game.currentTurn];
  const over = game.status === 'finished' || !!result;
  const status = result
    ?? (game.checkmate ? `Checkmate! ${SIDE[game.currentTurn === 'white' ? 'black' : 'white']} wins 🏆`
      : game.stalemate ? 'Draw (stalemate / 50-move rule)'
        : thinking ? 'Bot is thinking…'
          : `${turnName} to move${game.inCheck ? ' — CHECK!' : ''}`);

  const captured = (color: 'white' | 'black') => {
    const start: Record<PieceType, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };
    for (const row of game.board) for (const p of row) if (p?.color === color) start[p.type]--;
    return (Object.keys(start) as PieceType[]).flatMap((t) => Array(Math.max(0, start[t])).fill(t) as PieceType[]);
  };
  const material = (c: 'white' | 'black') => captured(c === 'white' ? 'black' : 'white').reduce((s, t) => s + VALUE[t], 0);
  const diff = material('white') - material('black');

  const click = (r: number, c: number) => {
    if (over || botTurn) return;
    const piece = game.board[r][c];
    if (selected) {
      const options = legal.filter((m) => m.from.row === selected.row && m.from.col === selected.col && m.to.row === r && m.to.col === c);
      if (options.length > 1) { setPromo(options); return; }
      if (options.length === 1) { play(options[0]); return; }
    }
    setSelected(piece?.color === game.currentTurn ? { row: r, col: c } : null);
  };

  const undo = () => {
    if (history.length < 2) return;
    const back = mode === 'bot' ? (history.length >= 3 ? 2 : 1) : 1;
    setHistory((h) => h.slice(0, Math.max(1, h.length - back)));
    setMoves((m) => m.slice(0, Math.max(0, m.length - back)));
    setSelected(null); setLastMove(null); setResult(null);
  };

  const targets = selected ? legal.filter((m) => m.from.row === selected.row && m.from.col === selected.col) : [];
  const kingInCheck = game.inCheck ? findKing(game.board, game.currentTurn) : null;
  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <Shell onBack={onBack}>
      <CapturedRow pieces={captured(flipped ? 'black' : 'white')} color={flipped ? 'black' : 'white'} lead={flipped ? diff : -diff} />
      <div className="chess-frame mx-auto w-full max-w-[560px] select-none rounded-xl p-[4%]">
        <div className="relative grid grid-cols-8 overflow-hidden rounded-sm border-2 border-[#b8860b]">
          {rows.map((r) => cols.map((c) => {
            const p = game.board[r][c];
            const light = (r + c) % 2 === 0;
            const isSel = selected?.row === r && selected.col === c;
            const target = targets.find((m) => m.to.row === r && m.to.col === c);
            const isLast = lastMove && ((lastMove.from.row === r && lastMove.from.col === c) || (lastMove.to.row === r && lastMove.to.col === c));
            const isCheck = kingInCheck?.row === r && kingInCheck.col === c;
            return (
              <button key={`${r}${c}`} onClick={() => click(r, c)} aria-label={`${sq(r, c)}${p ? ` ${SIDE[p.color]} ${p.type}` : ''}`}
                className={`relative flex aspect-square items-center justify-center ${light ? 'chess-light' : 'chess-dark'}`}>
                {isLast && <span className="absolute inset-0 bg-amber-300/35" />}
                {isSel && <span className="absolute inset-0 bg-emerald-400/50" />}
                {isCheck && <span className="absolute inset-0 bg-red-600/60" />}
                {p && <Piece piece={p} />}
                {target && <span className={`absolute rounded-full ${p ? 'inset-1 border-4 border-emerald-500/80' : 'h-1/4 w-1/4 bg-emerald-500/80'}`} />}
                {c === cols[0] && <span className={`absolute left-0.5 top-0 text-[10px] font-bold ${light ? 'text-black/60' : 'text-[#e5c158]'}`}>{8 - r}</span>}
                {r === rows[7] && <span className={`absolute bottom-0 right-1 text-[10px] font-bold ${light ? 'text-black/60' : 'text-[#e5c158]'}`}>{FILES[c]}</span>}
              </button>
            );
          }))}
        </div>
      </div>
      <CapturedRow pieces={captured(flipped ? 'white' : 'black')} color={flipped ? 'white' : 'black'} lead={flipped ? -diff : diff} />

      {promo && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-accent p-2">
          <span className="font-bold">Promote to:</span>
          {promo.map((m) => (
            <button key={m.promotion} onClick={() => play(m)} className="btn btn-outline btn-sm text-2xl" aria-label={m.promotion}>{GLYPH[m.promotion!]}</button>
          ))}
        </div>
      )}

      <p className={`text-center text-lg font-bold ${game.inCheck && !over ? 'text-red-600' : ''}`} aria-live="polite">{status}</p>

      {over ? (
        <button onClick={start} className="btn btn-primary w-full">Play again</button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={undo} disabled={history.length < 2 || thinking} className="btn btn-outline flex-1 disabled:opacity-50">↶ Undo</button>
          <button onClick={() => window.confirm(mode === 'bot' ? 'Offer a draw? The bot accepts if material is level.' : 'Do both players agree to a draw?')
            && (mode === 'local' || Math.abs(diff) <= 1 ? setResult('Draw agreed 🤝') : window.alert('The bot declines the draw.'))} className="btn btn-outline flex-1">🤝 Offer draw</button>
          <button onClick={() => window.confirm(`${mode === 'bot' ? 'You' : turnName} resign?`) && setResult(`${mode === 'bot' ? SIDE[humanColor] : turnName} resigned — ${SIDE[(mode === 'bot' ? humanColor : game.currentTurn) === 'white' ? 'black' : 'white']} wins 🏆`)} className="btn btn-outline flex-1">🏳 Resign</button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={start} className="btn btn-outline flex-1">Restart</button>
        <button onClick={() => { setHistory([]); setSaved(null); }} className="btn btn-outline flex-1">New setup</button>
      </div>

      {moves.length > 0 && (
        <ol className="grid max-h-40 grid-cols-2 gap-x-4 overflow-y-auto rounded-lg border-2 border-border p-2 font-mono text-sm sm:grid-cols-3">
          {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
            <li key={i}>{i + 1}. {moves[i * 2]} {moves[i * 2 + 1] ?? ''}</li>
          ))}
        </ol>
      )}
      <Rulebook title="Chess Rulebook" sections={CHESS_RULES} />
    </Shell>
  );
}

function findKing(board: (ChessPiece | null)[][], color: 'white' | 'black') {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.type === 'king' && board[r][c]?.color === color) return { row: r, col: c };
  return null;
}

function Piece({ piece }: { piece: ChessPiece }) {
  return <span className={`relative z-10 leading-none chess-piece ${piece.color === 'white' ? 'chess-gold' : 'chess-black'}`}>{GLYPH[piece.type]}</span>;
}

function CapturedRow({ pieces, color, lead }: { pieces: PieceType[]; color: 'white' | 'black'; lead: number }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-0.5 text-2xl" aria-label={`Captured ${SIDE[color]} pieces`}>
      {pieces.map((t, i) => <span key={i} className={color === 'white' ? 'chess-gold' : 'chess-black'}>{GLYPH[t]}</span>)}
      {lead > 0 && <span className="ml-2 text-sm font-bold">+{lead}</span>}
    </div>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <button onClick={onBack} className="text-secondary">← Back to Chess</button>
      <div className="card space-y-4 p-5">
        <h1>♟️ Chess</h1>
        {children}
      </div>
    </main>
  );
}
