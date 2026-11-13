'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChessEngine, CHESS_RULES, createPlayer,
  type ChessState, type ChessMove, type ChessPiece, type PieceType, type Difficulty,
} from '@slgh/shared';
import Rulebook from './Rulebook';
import { RoomLobby, JoinRequests } from './RoomLobby';
import { VoiceChat } from './VoiceChat';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { useRoom, type RoomApi } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new ChessEngine();
const SAVE_KEY = 'chess_game_state_v2';
const FILES = 'ABCDEFGH';
const GLYPH: Record<PieceType, string> = { king: '♚\uFE0E', queen: '♛\uFE0E', rook: '♜\uFE0E', bishop: '♝\uFE0E', knight: '♞\uFE0E', pawn: '♟\uFE0E' };
const VALUE: Record<PieceType, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const SIDE = { white: 'Gold', black: 'Black' } as const;

type Mode = 'bot' | 'local' | 'online';
type Square = { row: number; col: number };
type OnlineMove = Extract<Parameters<RoomApi['move']>[0], { type: 'chess' }>;
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
    sfx(game.board[m.to.row][m.to.col] || m.enPassant ? 'capture' : 'move');
    setHistory((h) => [...h, next]);
    setMoves((ms) => [...ms, notation(game, m) + (next.checkmate ? '#' : next.inCheck ? '+' : '')]);
    setLastMove(m); setSelected(null); setPromo(null);
  };

  const legal = useMemo(() => (game && game.status === 'playing' ? engine.getLegalMoves(game) : []), [game]);
  useEndSfx(!!game && (game.status === 'finished' || !!result), mode === 'bot' && !!game?.checkmate && game.currentTurn === humanColor);
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
        <ConvexRoomProvider><OnlineChess /></ConvexRoomProvider>
        <Rulebook title="Chess Rulebook" sections={CHESS_RULES} />
      </Shell>
    );
  }

  if (!game) {
    return (
      <Shell onBack={onBack}>
        {tabs}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/boards/chess.jpg" alt="Gold and black chess board" className="w-full rounded-xl" />
        {mode === 'bot' && (
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <label>Play as:
              <select value={humanColor} onChange={(e) => setHumanColor(e.target.value as 'white' | 'black')} className="ml-2 field">
                <option value="white">Gold (moves first)</option><option value="black">Black</option>
              </select>
            </label>
            <label>Bot level:
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className="ml-2 field">
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

  const captured = (color: 'white' | 'black') => capturedOf(game.board, color);
  const diff = materialLead(game.board);

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

  return (
    <Shell onBack={onBack}>
      <CapturedRow pieces={captured(flipped ? 'black' : 'white')} color={flipped ? 'black' : 'white'} lead={flipped ? diff : -diff} />
      <ChessBoard game={game} flipped={flipped} selected={selected} targets={targets} lastMove={lastMove} onSquare={click} />
      <CapturedRow pieces={captured(flipped ? 'white' : 'black')} color={flipped ? 'white' : 'black'} lead={flipped ? -diff : diff} />

      {promo && <PromotionPicker options={promo} onPick={play} />}

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

/* ------------------------------------------------------------------ */
/* Online: the server referees every move and plays the bots            */
/* ------------------------------------------------------------------ */

function OnlineChess() {
  const room = useRoom('chess');
  const v = room.view;
  const game = (v?.state ?? null) as ChessState | null;
  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && game?.status === 'playing';
  return (
    <div className="space-y-4">
      <VoiceChat room={room} />
      {room.joined && game && <OnlineChessTable game={game} seat={v?.me?.seat ?? -1} busy={room.busy} onMove={(m) => { room.move(m); }} />}
      {playing && <JoinRequests room={room} />}
      {room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>}
      {!playing && <RoomLobby room={room} title="Chess" maxSeats={2} />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm('Leave this game? A bot will take your seat.')) room.leave(); }}><Icon name="logout" size={18} />Leave game</button>}
    </div>
  );
}

/** Seat 0 plays Gold (white), seat 1 Black. Each player sees their own pieces at the bottom; spectators see Gold's side. */
function OnlineChessTable({ game, seat, busy, onMove }: { game: ChessState; seat: number; busy: boolean; onMove: (m: OnlineMove) => void }) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<ChessMove[] | null>(null);
  const [lastMove, setLastMove] = useState<ChessMove | null>(null);
  const mine = seat === 0 ? 'white' : seat === 1 ? 'black' : null;
  const over = game.status === 'finished';
  const myTurn = mine !== null && game.status === 'playing' && game.currentPlayerIndex === seat && !busy;

  // The server only sends positions: work out which move was just played, for the highlight and the sound.
  const key = boardKey(game.board);
  const prev = useRef<ChessState | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    setSelected(null); setPromo(null);
    const m = before?.status === 'playing' ? engine.getLegalMoves(before).find((x) => boardKey(engine.applyMove(before, x).board) === key) : undefined;
    setLastMove(m ?? null);
    if (m) sfx(before!.board[m.to.row][m.to.col] || m.enPassant ? 'capture' : 'move');
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEndSfx(over, mine !== null && game.winner !== null && game.winner !== seat);

  const legal = useMemo(() => (myTurn ? engine.getLegalMoves(game) : []), [game, myTurn]);
  const targets = selected ? legal.filter((m) => m.from.row === selected.row && m.from.col === selected.col) : [];

  const send = (m: ChessMove) => {
    onMove({ type: 'chess', from: { row: m.from.row, col: m.from.col }, to: { row: m.to.row, col: m.to.col },
      ...(m.promotion ? { promotion: m.promotion as NonNullable<OnlineMove['promotion']> } : {}) });
    setSelected(null); setPromo(null);
  };
  const click = (r: number, c: number) => {
    if (!myTurn) return;
    if (selected) {
      const options = targets.filter((m) => m.to.row === r && m.to.col === c);
      if (options.length > 1) { setPromo(options); return; }
      if (options.length === 1) { send(options[0]); return; }
    }
    setSelected(game.board[r][c]?.color === mine ? { row: r, col: c } : null);
  };

  const colorOf = (i: number) => (i === 0 ? 'white' : 'black');
  const who = (i: number) => (i === seat ? 'You' : `${game.players[i]?.name ?? 'Player'} (${SIDE[colorOf(i)]})`);
  const turn = game.currentPlayerIndex;
  const status = over
    ? game.winner !== null ? `${game.checkmate ? 'Checkmate! ' : ''}${who(game.winner)} ${game.winner === seat ? 'win' : 'wins'} 🏆`
      : game.stalemate ? 'Draw (stalemate / 50-move rule) 🤝' : 'Draw 🤝'
    : game.players[turn]?.isAI ? `${who(turn)} is thinking…`
      : `${turn === seat ? `Your move (${SIDE[game.currentTurn]})` : `${who(turn)} to move`}${game.inCheck ? ' — CHECK!' : ''}`;

  const flipped = seat === 1;
  const diff = materialLead(game.board);
  const [top, bottom] = flipped ? [0, 1] : [1, 0];
  const tag = (i: number) => (
    <p className="flex items-center gap-2 text-sm font-bold">
      <span className={`text-xl leading-none ${i === 0 ? 'chess-gold' : 'chess-black'}`} aria-hidden>{GLYPH.king}</span>
      <span className="min-w-0 truncate">{game.players[i]?.name ?? SIDE[colorOf(i)]}{i === seat ? ' (you)' : ''}</span>
      {!over && turn === i && <span className="chip chip-primary ml-auto shrink-0">To move</span>}
    </p>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {tag(top)}
        <CapturedRow pieces={capturedOf(game.board, flipped ? 'black' : 'white')} color={flipped ? 'black' : 'white'} lead={flipped ? diff : -diff} />
      </div>
      <ChessBoard game={game} flipped={flipped} selected={selected} targets={targets} lastMove={lastMove} onSquare={click} />
      <div className="space-y-1">
        <CapturedRow pieces={capturedOf(game.board, flipped ? 'white' : 'black')} color={flipped ? 'white' : 'black'} lead={flipped ? -diff : diff} />
        {tag(bottom)}
      </div>
      {promo && myTurn && <PromotionPicker options={promo} onPick={send} />}
      <p className={`text-center text-lg font-bold ${game.inCheck && !over ? 'text-red-600' : ''}`} aria-live="polite">{status}</p>
      {seat < 0 && <p className="text-center text-sm text-muted">You are watching this game.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board and pieces, shared by every mode                               */
/* ------------------------------------------------------------------ */

function ChessBoard({ game, flipped, selected, targets, lastMove, onSquare }: {
  game: ChessState; flipped: boolean; selected: Square | null; targets: ChessMove[]; lastMove: ChessMove | null; onSquare: (r: number, c: number) => void;
}) {
  const kingInCheck = game.inCheck ? findKing(game.board, game.currentTurn) : null;
  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  return (
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
            <button key={`${r}${c}`} onClick={() => onSquare(r, c)} aria-label={`${sq(r, c)}${p ? ` ${SIDE[p.color]} ${p.type}` : ''}`}
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
  );
}

function PromotionPicker({ options, onPick }: { options: ChessMove[]; onPick: (m: ChessMove) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-accent p-2">
      <span className="font-bold">Promote to:</span>
      {options.map((m) => (
        <button key={m.promotion} onClick={() => onPick(m)} className="btn btn-outline btn-sm text-2xl" aria-label={m.promotion}>{GLYPH[m.promotion!]}</button>
      ))}
    </div>
  );
}

/** Pieces of `color` that have been taken off the board */
function capturedOf(board: (ChessPiece | null)[][], color: 'white' | 'black') {
  const start: Record<PieceType, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };
  for (const row of board) for (const p of row) if (p?.color === color) start[p.type]--;
  return (Object.keys(start) as PieceType[]).flatMap((t) => Array(Math.max(0, start[t])).fill(t) as PieceType[]);
}
/** Gold's material lead (negative when Black is ahead) */
function materialLead(board: (ChessPiece | null)[][]) {
  const material = (c: 'white' | 'black') => capturedOf(board, c === 'white' ? 'black' : 'white').reduce((s, t) => s + VALUE[t], 0);
  return material('white') - material('black');
}
const boardKey = (board: (ChessPiece | null)[][]) => board.map((row) => row.map((p) => (p ? `${p.color}-${p.type}` : '')).join(',')).join('/');

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
    <main className="mx-auto max-w-2xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={onBack} className="back-link">← Back to Chess</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>♟️ Chess</h1>
        {children}
      </div>
    </main>
  );
}
