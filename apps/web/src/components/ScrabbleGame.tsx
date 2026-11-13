'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ScrabbleEngine, SCRABBLE_RULES, SCRABBLE_SQUARES, SCRABBLE_ROWS, analyzePlay, squareName, createPlayer,
  type ScrabbleState, type ScrabbleMove, type Placement, type Difficulty, type SquareType,
} from '@slgh/shared';
import Rulebook from './Rulebook';
import { RoomLobby, JoinRequests } from './RoomLobby';
import { VoiceChat } from './VoiceChat';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { useRoom } from '@/lib/useRoom';
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

type Mode = 'local' | 'online';
interface Seat { name: string; ai: boolean; level: Difficulty }
/** What the server sends: other players' racks are [] until the game ends, the bag is [] */
type ScrabbleView = ScrabbleState & { rackCounts: number[]; bagCount: number };

const championText = (g: ScrabbleState) => (g.winner !== null
  ? `🏆 ${g.players[g.winner].name} is the SCRABBLE CHAMPION!`
  : `It’s a tie between ${g.tiedPlayers.map((i) => g.players[i].name).join(' and ')}!`);

export default function ScrabbleGame({ onBack }: { onBack: () => void }) {
  // Decided after mount so an online link never starts the local dictionary download.
  const [mode, setMode] = useState<Mode | null>(null);
  // A shared room link opens straight into online play.
  useEffect(() => { const q = new URLSearchParams(location.search); setMode(q.has('room') || q.has('online') ? 'online' : 'local'); }, []);
  const tabs = (
    <div role="tablist" aria-label="How to play" className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-bg/60 p-1">
      {([['local', 'This device', 'gamepad'], ['online', 'Online', 'globe']] as const).map(([m, label, icon]) => (
        <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
          className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-surface text-primary shadow-soft' : 'text-muted'}`}>
          <Icon name={icon} size={16} />{label}
        </button>
      ))}
    </div>
  );
  if (mode === 'local') return <LocalScrabble onBack={onBack} tabs={tabs} />;
  return (
    <Shell onBack={onBack} tabs={tabs} wide={mode === 'online'}>
      {mode === 'online' && <ConvexRoomProvider><OnlineScrabble /></ConvexRoomProvider>}
      <Rulebook title="Scrabble Official Game Rulebook" sections={SCRABBLE_RULES} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Local: bots and/or several people sharing one device                 */
/* ------------------------------------------------------------------ */

function LocalScrabble({ onBack, tabs }: { onBack: () => void; tabs: ReactNode }) {
  const [ready, setReady] = useState(engine.hasDictionary());
  const [loadError, setLoadError] = useState(false);
  const [seats, setSeats] = useState<Seat[]>([{ name: 'Player 1', ai: false, level: 'medium' }, { name: 'Bot', ai: true, level: 'medium' }]);
  const [game, setGame] = useState<ScrabbleState | null>(null);
  const [saved, setSaved] = useState<ScrabbleState | null>(null);
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

  // New turn: with several humans, hide the rack until the next player is ready
  useEffect(() => {
    if (!game) return;
    setRevealed(humans <= 1);
  }, [game?.currentPlayerIndex, game?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (s: ScrabbleState) => { setGame(s); setMessage(s.log.at(-1) ?? ''); };
  const start = () => begin(engine.initialize(seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || `Player ${i + 1}`, s.ai, s.ai ? s.level : undefined))));

  const commit = (s: ScrabbleState, m: ScrabbleMove) => {
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

  const resize = (n: number) => setSeats((s) => Array.from({ length: n }, (_, i) => s[i] ?? { name: `Bot ${i + 1}`, ai: true, level: 'medium' }));
  const updateSeat = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  useEndSfx(game?.status === 'finished');
  if (!game) {
    return (
      <Shell onBack={onBack} tabs={tabs}>
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

  const finished = game.status === 'finished';
  const humanTurn = game.status === 'playing' && !current!.isAI;

  return (
    <Shell onBack={onBack} tabs={tabs} wide>
      <ScrabbleTable
        game={game}
        bagCount={game.bag.length}
        rackSeat={humanTurn && revealed ? game.currentPlayerIndex : null}
        rackLabel={`${current!.name}’s rack`}
        myTurn={humanTurn && revealed}
        isWord={engine.isWord}
        status={finished ? championText(game) : thinking ? `${current!.name} is thinking…` : message}
        onMove={(m) => commit(game, m)}
        onReject={setMessage}
        rackSlot={humanTurn && !revealed && (
          <button onClick={() => setRevealed(true)} className="btn btn-primary w-full">🙈 Hand the device to {current!.name} — tap to show rack</button>
        )}
        footer={finished && <button onClick={start} className="btn btn-primary w-full">Play again</button>}
        asideFooter={(
          <div className="flex gap-2">
            <button onClick={() => window.confirm('Start a new game?') && start()} className="btn btn-outline btn-sm flex-1">Restart</button>
            <button onClick={() => { setSaved(game.status === 'playing' ? game : null); setGame(null); }} className="btn btn-outline btn-sm flex-1">Quit</button>
          </div>
        )}
      />
      <Rulebook title="Scrabble Official Game Rulebook" sections={SCRABBLE_RULES} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Online: the server holds the bag, checks words and runs the bots     */
/* ------------------------------------------------------------------ */

function OnlineScrabble() {
  const room = useRoom('scrabble');
  const v = room.view;
  const state = (v?.state ?? null) as ScrabbleView | null;
  const seat = v?.me?.seat ?? -1;

  // One sound per move, whoever made it.
  const lastUpdate = useRef(state?.updatedAt);
  useEffect(() => {
    if (state?.updatedAt === undefined || state.updatedAt === lastUpdate.current) return;
    if (lastUpdate.current !== undefined && state.lastPlay) sfx('move');
    lastUpdate.current = state.updatedAt;
  }, [state?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const finished = state?.status === 'finished';
  useEndSfx(finished, seat >= 0 && state?.winner !== seat);

  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && state?.status === 'playing';
  const current = state?.players[state.currentPlayerIndex];
  const myTurn = !!playing && seat >= 0 && seat === state.currentPlayerIndex;
  const errorBox = room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>;

  return (
    <div className="space-y-4">
      <VoiceChat room={room} />
      {room.joined && state && current && (
        <ScrabbleTable
          game={state}
          bagCount={state.bagCount}
          rackCounts={state.rackCounts}
          you={seat >= 0 ? seat : undefined}
          rackSeat={playing && seat >= 0 ? seat : null}
          rackLabel={myTurn ? 'Your rack' : `Your rack — ${current.name} is playing`}
          myTurn={myTurn}
          busy={room.busy}
          status={finished ? championText(state)
            : room.busy && myTurn ? 'Checking your move…'
              : myTurn ? 'Your turn!'
                : current.isAI ? `${current.name} is thinking…` : `Waiting for ${current.name}…`}
          note={!finished ? state.log.at(-1) : undefined}
          alert={errorBox}
          onMove={(m) => { room.scrabbleMove(m); }}
          onEdit={() => { if (room.error) room.setError(null); }}
        />
      )}
      {playing && <JoinRequests room={room} />}
      {!playing && <RoomLobby room={room} title="Scrabble" maxSeats={4} />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm('Leave this game? A bot will take your seat.')) room.leave(); }}><Icon name="logout" size={18} />Leave game</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The table: board, rack and scores, the same for every mode           */
/* ------------------------------------------------------------------ */

function ScrabbleTable({
  game, bagCount, rackCounts, you, rackSeat, rackLabel, myTurn, busy = false, isWord, status, note, alert,
  onMove, onReject, onEdit, rackSlot, footer, asideFooter,
}: {
  game: ScrabbleState;
  bagCount: number;
  /** Online: tiles left in each player's rack */
  rackCounts?: number[];
  /** Online: your seat, marked on the scoreboard */
  you?: number;
  /** Whose rack to show (null: none) */
  rackSeat: number | null;
  rackLabel: string;
  /** The shown rack belongs to the player whose turn it is */
  myTurn: boolean;
  /** A move is on its way to the server */
  busy?: boolean;
  /** Local dictionary for previews; online the server checks words */
  isWord?: (w: string) => boolean;
  status: string;
  note?: string;
  alert?: ReactNode;
  onMove: (m: ScrabbleMove) => void;
  onReject?: (message: string) => void;
  /** The player changed their tentative tiles */
  onEdit?: () => void;
  rackSlot?: ReactNode;
  footer?: ReactNode;
  asideFooter?: ReactNode;
}) {
  const [pending, setPending] = useState<Placement[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [blankFor, setBlankFor] = useState<{ row: number; col: number; rackIndex: number } | null>(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSel, setExchangeSel] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);

  const rack = rackSeat !== null ? game.racks[rackSeat] ?? [] : [];
  const canAct = myTurn && !busy;

  // New turn (or the game moved on): reset rack ordering and pending tiles. A rejected move changes nothing, so the tiles stay put.
  useEffect(() => {
    setOrder(rack.map((_, i) => i));
    setPending([]); setChosen(null); setBlankFor(null); setExchangeMode(false); setExchangeSel([]);
  }, [game.currentPlayerIndex, game.updatedAt, rackSeat]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => (canAct && pending.length ? analyzePlay(game, pending, isWord) : null), [canAct, game, pending, isWord]);

  const edit = (fn: (p: Placement[]) => Placement[]) => { setPending(fn); onEdit?.(); };
  const placedAt = (r: number, c: number) => pending.find((p) => p.row === r && p.col === c);
  const usedIdx = new Set(pending.map((p) => p.rackIndex));
  const lastCells = new Set((game.lastPlay?.cells ?? []).map(([r, c]) => r * 15 + c));

  const clickCell = (r: number, c: number) => {
    if (!canAct || exchangeMode) return;
    const existing = placedAt(r, c);
    if (existing) { edit((p) => p.filter((x) => x !== existing)); return; }
    if (game.board[r][c] || chosen === null || !rack[chosen]) return;
    if (rack[chosen].isBlank) { setBlankFor({ row: r, col: c, rackIndex: chosen }); return; }
    edit((p) => [...p, { row: r, col: c, rackIndex: chosen, letter: rack[chosen].letter }]);
    setChosen(null);
  };
  const clickRack = (i: number) => {
    if (!canAct) return;
    if (exchangeMode) { setExchangeSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i])); return; }
    if (usedIdx.has(i)) { edit((p) => p.filter((x) => x.rackIndex !== i)); return; }
    setChosen(chosen === i ? null : i);
  };

  const submit = () => {
    if (!analysis || !canAct) return;
    if (!analysis.ok) { onReject?.(`⚠️ ${analysis.error}`); return; }
    if (analysis.invalid.length) { onReject?.(`❌ Not in the dictionary: ${analysis.invalid.join(', ')}. Try another word.`); return; }
    onMove({ type: 'play', placements: pending });
  };

  const finished = game.status === 'finished';

  return (
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
                  const from = pend ? rack[pend.rackIndex] : undefined;
                  const sq = SQUARE_STYLE[SCRABBLE_SQUARES[r][c]];
                  const shown = tile ?? (pend && from ? { letter: pend.letter, value: from.isBlank ? 0 : from.value, isBlank: !!from.isBlank } : null);
                  return (
                    <button key={c} onClick={() => clickCell(r, c)} aria-label={`${squareName(r, c)}${shown ? ` ${shown.letter}` : ''}`}
                      className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[2px]"
                      style={{ background: sq.bg, color: sq.fg }}>
                      {shown ? (
                        <Tile letter={shown.letter} value={shown.value} blank={shown.isBlank} pending={!tile && !!pend} recent={lastCells.has(r * 15 + c)} />
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
          {analysis?.ok && !analysis.invalid.length
            ? `${analysis.words.map((w) => `${w.word} ${w.score}`).join(' + ')}${analysis.bingo ? ' + 50 bingo' : ''} = ${analysis.score} points`
            : analysis && !analysis.ok ? analysis.error : analysis?.ok ? `Not a valid word: ${analysis.invalid.join(', ')}` : status}
        </p>
        {note && note !== status && <p className="-mt-2 text-center text-sm text-muted">{note}</p>}
        {alert}

        {rackSeat !== null ? (
          <div className="space-y-2">
            <p className="text-center text-sm font-bold">{rackLabel} {canAct && (exchangeMode ? '— select tiles to exchange' : chosen !== null ? '— tap a square to place' : '— tap a tile, then a square')}</p>
            <div className="mx-auto flex max-w-md justify-center gap-1 rounded-lg bg-[#6b3f1d] p-2 shadow-inner">
              {order.filter((i) => i < rack.length).map((i) => (
                <button key={i} onClick={() => clickRack(i)} className={`w-[12%] max-w-[52px] transition ${usedIdx.has(i) ? 'opacity-25' : ''} ${chosen === i || exchangeSel.includes(i) ? '-translate-y-2' : ''}`}
                  aria-label={`Rack tile ${rack[i].letter || 'blank'}`}>
                  <Tile letter={rack[i].letter} value={rack[i].value} blank={!!rack[i].isBlank} pending={chosen === i || exchangeSel.includes(i)} />
                </button>
              ))}
            </div>
            {myTurn && (exchangeMode ? (
              <div className="flex gap-2">
                <button onClick={() => onMove({ type: 'exchange', indices: exchangeSel })} disabled={!exchangeSel.length || busy} className="btn btn-primary flex-1 disabled:opacity-50">Exchange {exchangeSel.length}</button>
                <button onClick={() => { setExchangeMode(false); setExchangeSel([]); }} disabled={busy} className="btn btn-outline flex-1 disabled:opacity-50">Cancel</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={submit} disabled={!pending.length || busy} className="btn btn-primary flex-1 disabled:opacity-50">{busy ? 'Checking…' : '✔ Play word'}</button>
                <button onClick={() => { edit(() => []); setChosen(null); }} disabled={!pending.length || busy} className="btn btn-outline flex-1 disabled:opacity-50">↩ Recall</button>
                <button onClick={() => setOrder((o) => [...o].sort(() => Math.random() - 0.5))} className="btn btn-outline flex-1">🔀 Shuffle</button>
                <button onClick={() => { edit(() => []); setChosen(null); setExchangeMode(true); }} disabled={bagCount < 7 || busy} title={bagCount < 7 ? 'At least 7 tiles must remain in the bag' : ''} className="btn btn-outline flex-1 disabled:opacity-50">🔁 Exchange</button>
                <button onClick={() => window.confirm('Pass your turn?') && onMove({ type: 'pass' })} disabled={busy} className="btn btn-outline flex-1 disabled:opacity-50">⏭ Pass</button>
              </div>
            ))}
          </div>
        ) : rackSlot}
        {footer}
      </div>

      <aside className="space-y-3 text-sm">
        <div className="rounded-lg border-2 border-border p-2">
          <h2 className="mb-1 text-base">Scores</h2>
          <ul className="space-y-1">
            {game.players.map((p, i) => (
              <li key={p.id} className={`flex justify-between gap-2 rounded px-1 font-bold ${i === game.currentPlayerIndex && !finished ? 'ring-2 ring-primary' : ''}`}>
                <span className="min-w-0 truncate">
                  {p.name}{p.isAI ? ' 🤖' : ''}{i === you ? ' (you)' : ''}
                  {rackCounts && !finished && <span className="font-normal text-muted"> · {rackCounts[i]} tiles</span>}
                </span>
                <span className="shrink-0">{game.scores[i]}{game.endAdjustments ? ` (${game.endAdjustments[i] >= 0 ? '+' : ''}${game.endAdjustments[i]})` : ''}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">Tiles in bag: {bagCount}</p>
        </div>
        <div className="rounded-lg border-2 border-border p-2">
          <h2 className="mb-1 text-base">Game log</h2>
          <ol className="max-h-56 space-y-0.5 overflow-y-auto">
            {[...game.log].reverse().map((l, i) => <li key={i}>{l}</li>)}
          </ol>
        </div>
        {asideFooter}
      </aside>

      {blankFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Choose a letter for the blank tile">
          <div className="card max-w-sm space-y-2 p-4">
            <p className="font-bold">Which letter is the blank tile?</p>
            <div className="grid grid-cols-7 gap-1">
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => (
                <button key={l} onClick={() => { edit((p) => [...p, { ...blankFor, letter: l }]); setBlankFor(null); setChosen(null); }} className="btn btn-outline btn-sm px-0">{l}</button>
              ))}
            </div>
            <button onClick={() => setBlankFor(null)} className="btn btn-outline btn-sm w-full">Cancel</button>
          </div>
        </div>
      )}
    </div>
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

function Shell({ onBack, tabs, children, wide = false }: { onBack: () => void; tabs?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto space-y-3 px-2 py-3 sm:space-y-4 sm:p-4 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <button onClick={onBack} className="back-link">← Back to Scrabble</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>🔠 Scrabble</h1>
        {tabs}
        {children}
      </div>
    </main>
  );
}
