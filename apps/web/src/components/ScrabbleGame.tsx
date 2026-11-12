'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ScrabbleEngine, SCRABBLE_RULES, SCRABBLE_SQUARES, SCRABBLE_ROWS, analyzePlay, squareName, createPlayer,
  type ScrabbleState, type Placement, type Difficulty, type SquareType,
} from '@slgh/shared';
import Rulebook from './Rulebook';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new ScrabbleEngine();
let dictionaryPromise: Promise<void> | null = null;
const loadDictionary = () => (dictionaryPromise ??= fetch('/games/scrabble/words.txt')
  .then((r) => { if (!r.ok) throw new Error('dictionary'); return r.text(); })
  .then((txt) => engine.setDictionary(txt.split('\n')))
  .catch((e) => { dictionaryPromise = null; throw e; }));

const SAVE_KEY = 'scrabble_game_state_v2';
const SQUARE_STYLE: Record<SquareType, { bg: string; label: string; fg: string }> = {
  normal: { bg: '#0f7a3a', label: '', fg: '#fff' },
  double_letter: { bg: '#a9d8f2', label: 'DOUBLE LETTER', fg: '#0b3d5c' },
  triple_letter: { bg: '#1f7fd6', label: 'TRIPLE LETTER', fg: '#fff' },
  double_word: { bg: '#f4a46a', label: 'DOUBLE WORD', fg: '#5b2a0c' },
  triple_word: { bg: '#d7262e', label: 'TRIPLE WORD', fg: '#fff' },
  center: { bg: '#f4a46a', label: '★', fg: '#c2185b' },
};

interface Seat { name: string; ai: boolean; level: Difficulty }

export default function ScrabbleGame({ onBack }: { onBack: () => void }) {
  const [ready, setReady] = useState(engine.hasDictionary());
  const [loadError, setLoadError] = useState(false);
  const [seats, setSeats] = useState<Seat[]>([{ name: 'Player 1', ai: false, level: 'medium' }, { name: 'Bot', ai: true, level: 'medium' }]);
  const [game, setGame] = useState<ScrabbleState | null>(null);
  const [saved, setSaved] = useState<ScrabbleState | null>(null);
  const [pending, setPending] = useState<Placement[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [blankFor, setBlankFor] = useState<{ row: number; col: number; rackIndex: number } | null>(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSel, setExchangeSel] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(true);
  const [message, setMessage] = useState('');
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    loadDictionary().then(() => setReady(true)).catch(() => setLoadError(true));
    try {
      const s = engine.deserialize(localStorage.getItem(SAVE_KEY) ?? '');
      if (s.status === 'playing' && Array.isArray(s.racks)) setSaved(s);
    } catch { /* no save */ }
  }, []);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'playing') localStorage.setItem(SAVE_KEY, engine.serialize(game));
    else localStorage.removeItem(SAVE_KEY);
  }, [game]);

  const humans = game ? game.players.filter((p) => !p.isAI).length : 0;
  const current = game?.players[game.currentPlayerIndex];
  const rack = game ? game.racks[game.currentPlayerIndex] : [];

  // New turn: reset rack ordering, pending tiles and (with several humans) hide the rack until the next player is ready
  useEffect(() => {
    if (!game) return;
    setOrder(game.racks[game.currentPlayerIndex].map((_, i) => i));
    setPending([]); setChosen(null); setExchangeMode(false); setExchangeSel([]);
    setRevealed(humans <= 1);
  }, [game?.currentPlayerIndex, game?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (s: ScrabbleState) => { setGame(s); setMessage(s.log.at(-1) ?? ''); };
  const start = () => begin(engine.initialize(seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || `Player ${i + 1}`, s.ai, s.ai ? s.level : undefined))));

  const commit = (s: ScrabbleState, m: Parameters<typeof engine.applyMove>[1]) => {
    const next = engine.applyMove(s, m);
    sfx('move');
    setGame(next);
    setMessage(next.log.at(-1) ?? '');
  };

  const botTurn = !!game && game.status === 'playing' && !!current?.isAI;
  useEffect(() => {
    if (!botTurn || !game || !ready) return;
    setThinking(true);
    const t = setTimeout(() => {
      commit(game, engine.getAIMove(game, current!.difficulty ?? 'medium'));
      setThinking(false);
    }, 700);
    return () => { clearTimeout(t); setThinking(false); };
  }, [botTurn, game, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => (game && pending.length ? analyzePlay(game, pending, engine.isWord) : null), [game, pending]);

  const resize = (n: number) => setSeats((s) => Array.from({ length: n }, (_, i) => s[i] ?? { name: `Bot ${i + 1}`, ai: true, level: 'medium' }));
  const updateSeat = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  useEndSfx(game?.status === 'finished');
  if (!game) {
    return (
      <Shell onBack={onBack}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/boards/scrabble.png" alt="Scrabble board" className="mx-auto w-full max-w-md rounded-xl" />
        <label className="text-sm font-semibold">Players:
          <select value={seats.length} onChange={(e) => resize(Number(e.target.value))} className="ml-2 field">
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <ul className="space-y-2">
          {seats.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input value={s.name} maxLength={20} onChange={(e) => updateSeat(i, { name: e.target.value })} className="field min-w-0 flex-1" aria-label={`Player ${i + 1} name`} />
              <select value={s.ai ? 'ai' : 'human'} onChange={(e) => updateSeat(i, { ai: e.target.value === 'ai' })} className="field" aria-label={`Player ${i + 1} type`}>
                <option value="human">Human</option><option value="ai">Bot</option>
              </select>
              {s.ai && (
                <select value={s.level} onChange={(e) => updateSeat(i, { level: e.target.value as Difficulty })} className="field" aria-label={`Player ${i + 1} bot level`}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              )}
            </li>
          ))}
        </ul>
        {loadError && <p className="font-semibold text-red-600">Could not load the dictionary. Check your connection and reload.</p>}
        <button onClick={start} disabled={!ready} className="btn btn-primary w-full disabled:opacity-50">{ready ? '🔠 Start game' : 'Loading dictionary…'}</button>
        {saved && <button onClick={() => begin(saved)} disabled={!ready} className="btn btn-outline w-full">Resume saved game</button>}
        <Rulebook title="Scrabble Official Game Rulebook" sections={SCRABBLE_RULES} open />
      </Shell>
    );
  }

  const placedAt = (r: number, c: number) => pending.find((p) => p.row === r && p.col === c);
  const usedIdx = new Set(pending.map((p) => p.rackIndex));
  const lastCells = new Set((game.lastPlay?.cells ?? []).map(([r, c]) => r * 15 + c));
  const myTurn = game.status === 'playing' && !current!.isAI && revealed;

  const clickCell = (r: number, c: number) => {
    if (!myTurn || exchangeMode) return;
    const existing = placedAt(r, c);
    if (existing) { setPending((p) => p.filter((x) => x !== existing)); return; }
    if (game.board[r][c] || chosen === null) return;
    if (rack[chosen].isBlank) { setBlankFor({ row: r, col: c, rackIndex: chosen }); return; }
    setPending((p) => [...p, { row: r, col: c, rackIndex: chosen, letter: rack[chosen].letter }]);
    setChosen(null);
  };
  const clickRack = (i: number) => {
    if (!myTurn) return;
    if (exchangeMode) { setExchangeSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); return; }
    if (usedIdx.has(i)) { setPending((p) => p.filter((x) => x.rackIndex !== i)); return; }
    setChosen(chosen === i ? null : i);
  };

  const submit = () => {
    if (!analysis) return;
    if (!analysis.ok) { setMessage(`⚠️ ${analysis.error}`); return; }
    if (analysis.invalid.length) { setMessage(`❌ Not in the dictionary: ${analysis.invalid.join(', ')}. Try another word.`); return; }
    commit(game, { type: 'play', placements: pending });
  };

  const finished = game.status === 'finished';
  const champion = finished ? (game.winner !== null ? `🏆 ${game.players[game.winner].name} is the SCRABBLE CHAMPION!` : `It’s a tie between ${game.tiedPlayers.map((i) => game.players[i].name).join(' and ')}!`) : '';

  return (
    <Shell onBack={onBack} wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-3">
          <div className="mx-auto w-full max-w-[640px] select-none rounded-lg bg-[#0b5e2c] p-1.5 shadow-lg">
            <div className="grid gap-px" style={{ gridTemplateColumns: 'minmax(12px,0.6fr) repeat(15, 1fr)' }}>
              <span />
              {Array.from({ length: 15 }, (_, c) => <span key={c} className="text-center text-[9px] font-bold text-white sm:text-xs">{c + 1}</span>)}
              {game.board.map((row, r) => (
                <Row key={r} label={SCRABBLE_ROWS[r]}>
                  {row.map((tile, c) => {
                    const pend = placedAt(r, c);
                    const sq = SQUARE_STYLE[SCRABBLE_SQUARES[r][c]];
                    const shown = tile ?? (pend ? { letter: pend.letter, value: rack[pend.rackIndex].isBlank ? 0 : rack[pend.rackIndex].value, isBlank: !!rack[pend.rackIndex].isBlank } : null);
                    return (
                      <button key={c} onClick={() => clickCell(r, c)} aria-label={`${squareName(r, c)}${shown ? ` ${shown.letter}` : ''}`}
                        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[2px]"
                        style={{ background: sq.bg, color: sq.fg }}>
                        {shown ? (
                          <Tile letter={shown.letter} value={shown.value} blank={shown.isBlank} pending={!!pend} recent={lastCells.has(r * 15 + c)} />
                        ) : sq.label && (
                          <span className={`text-center font-bold leading-[0.95] ${SCRABBLE_SQUARES[r][c] === 'center' ? 'text-[clamp(10px,3vw,20px)]' : 'text-[clamp(4px,1vw,7px)]'}`}>{sq.label}</span>
                        )}
                      </button>
                    );
                  })}
                </Row>
              ))}
            </div>
          </div>

          <p className="min-h-6 text-center font-semibold" aria-live="polite">
            {finished ? champion : thinking ? `${current!.name} is thinking…` : analysis?.ok && !analysis.invalid.length
              ? `${analysis.words.map((w) => `${w.word} ${w.score}`).join(' + ')}${analysis.bingo ? ' + 50 bingo' : ''} = ${analysis.score} points`
              : analysis && !analysis.ok ? analysis.error : analysis?.ok ? `Not a valid word: ${analysis.invalid.join(', ')}` : message}
          </p>

          {game.status === 'playing' && !current!.isAI && (
            revealed ? (
              <div className="space-y-2">
                <p className="text-center text-sm font-bold">{current!.name}’s rack {exchangeMode ? '— select tiles to exchange' : chosen !== null ? '— tap a square to place' : '— tap a tile, then a square'}</p>
                <div className="mx-auto flex max-w-md justify-center gap-1 rounded-lg bg-[#6b3f1d] p-2 shadow-inner">
                  {order.filter((i) => i < rack.length).map((i) => (
                    <button key={i} onClick={() => clickRack(i)} className={`w-[12%] max-w-[52px] transition ${usedIdx.has(i) ? 'opacity-25' : ''} ${chosen === i || exchangeSel.includes(i) ? '-translate-y-2' : ''}`}
                      aria-label={`Rack tile ${rack[i].letter || 'blank'}`}>
                      <Tile letter={rack[i].letter} value={rack[i].value} blank={!!rack[i].isBlank} pending={chosen === i || exchangeSel.includes(i)} />
                    </button>
                  ))}
                </div>
                {exchangeMode ? (
                  <div className="flex gap-2">
                    <button onClick={() => commit(game, { type: 'exchange', indices: exchangeSel })} disabled={!exchangeSel.length} className="btn btn-primary flex-1 disabled:opacity-50">Exchange {exchangeSel.length}</button>
                    <button onClick={() => { setExchangeMode(false); setExchangeSel([]); }} className="btn btn-outline flex-1">Cancel</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={submit} disabled={!pending.length} className="btn btn-primary flex-1 disabled:opacity-50">✔ Play word</button>
                    <button onClick={() => { setPending([]); setChosen(null); }} disabled={!pending.length} className="btn btn-outline flex-1 disabled:opacity-50">↩ Recall</button>
                    <button onClick={() => setOrder((o) => [...o].sort(() => Math.random() - 0.5))} className="btn btn-outline flex-1">🔀 Shuffle</button>
                    <button onClick={() => { setPending([]); setExchangeMode(true); }} disabled={game.bag.length < 7} title={game.bag.length < 7 ? 'At least 7 tiles must remain in the bag' : ''} className="btn btn-outline flex-1 disabled:opacity-50">🔁 Exchange</button>
                    <button onClick={() => window.confirm('Pass your turn?') && commit(game, { type: 'pass' })} className="btn btn-outline flex-1">⏭ Pass</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setRevealed(true)} className="btn btn-primary w-full">🙈 Hand the device to {current!.name} — tap to show rack</button>
            )
          )}
          {finished && <button onClick={start} className="btn btn-primary w-full">Play again</button>}
        </div>

        <aside className="space-y-3 text-sm">
          <div className="rounded-lg border-2 border-border p-2">
            <h2 className="mb-1 text-base">Scores</h2>
            <ul className="space-y-1">
              {game.players.map((p, i) => (
                <li key={p.id} className={`flex justify-between rounded px-1 font-bold ${i === game.currentPlayerIndex && !finished ? 'ring-2 ring-primary' : ''}`}>
                  <span>{p.name}{p.isAI ? ' 🤖' : ''}</span>
                  <span>{game.scores[i]}{game.endAdjustments ? ` (${game.endAdjustments[i] >= 0 ? '+' : ''}${game.endAdjustments[i]})` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-muted">Tiles in bag: {game.bag.length}</p>
          </div>
          <div className="rounded-lg border-2 border-border p-2">
            <h2 className="mb-1 text-base">Game log</h2>
            <ol className="max-h-56 space-y-0.5 overflow-y-auto">
              {[...game.log].reverse().map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.confirm('Start a new game?') && start()} className="btn btn-outline btn-sm flex-1">Restart</button>
            <button onClick={() => { setSaved(game.status === 'playing' ? game : null); setGame(null); }} className="btn btn-outline btn-sm flex-1">Quit</button>
          </div>
        </aside>
      </div>

      {blankFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Choose a letter for the blank tile">
          <div className="card max-w-sm space-y-2 p-4">
            <p className="font-bold">Which letter is the blank tile?</p>
            <div className="grid grid-cols-7 gap-1">
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => (
                <button key={l} onClick={() => { setPending((p) => [...p, { ...blankFor, letter: l }]); setBlankFor(null); setChosen(null); }} className="btn btn-outline btn-sm px-0">{l}</button>
              ))}
            </div>
            <button onClick={() => setBlankFor(null)} className="btn btn-outline btn-sm w-full">Cancel</button>
          </div>
        </div>
      )}
      <Rulebook title="Scrabble Official Game Rulebook" sections={SCRABBLE_RULES} />
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="flex items-center justify-center text-[9px] font-bold text-white sm:text-xs">{label}</span>
      {children}
    </>
  );
}

function Tile({ letter, value, blank, pending, recent }: { letter: string; value: number; blank: boolean; pending?: boolean; recent?: boolean }) {
  return (
    <span className={`relative flex aspect-square w-full items-center justify-center rounded-[3px] border font-extrabold text-black shadow ${pending ? 'border-amber-600 bg-amber-200' : recent ? 'border-yellow-500 bg-[#fff3c4]' : 'border-[#c9a96b] bg-[#f6e3b4]'}`}
      style={{ fontSize: 'clamp(10px, 3.2vw, 22px)' }}>
      <span className={blank ? 'text-rose-700' : ''}>{letter || ' '}</span>
      {!blank && <span className="absolute bottom-0 right-[6%] text-[clamp(5px,1.2vw,9px)] font-bold leading-none">{value}</span>}
    </span>
  );
}

function Shell({ onBack, children, wide = false }: { onBack: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto space-y-3 px-2 py-3 sm:space-y-4 sm:p-4 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <button onClick={onBack} className="back-link">← Back to Scrabble</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>🔠 Scrabble</h1>
        {children}
      </div>
    </main>
  );
}
