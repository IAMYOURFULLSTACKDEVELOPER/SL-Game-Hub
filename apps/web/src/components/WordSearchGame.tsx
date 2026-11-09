'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  WordSearchEngine, WORD_SEARCH_LEVELS, WORD_SEARCH_DIFFICULTIES, WORD_SEARCH_THEMES, WORD_SEARCH_RULES,
  WORD_SEARCH_BOARD_COUNT, getWordSearchBoard, getWordSearchBoards, dailyChallenge, selectionPath, createPlayer,
  type WordSearchState, type WordSearchDifficulty,
} from '@slgh/shared';
import Rulebook from './Rulebook';

const engine = new WordSearchEngine();
const SAVE_KEY = 'word_search_game_v2';
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899'];
const BOT_COLOR_NAMES = ['Green', 'Blue', 'Amber', 'Pink'];

interface Seat { name: string; ai: boolean }
interface Saved { state: WordSearchState; elapsed: number; daily: string | null }
interface ScoreEntry { name: string; score: number; time: number; date: string }

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, '0')}`;
const readJSON = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; }
};

export default function WordSearchGame({ onBack }: { onBack: () => void }) {
  const [seats, setSeats] = useState<Seat[]>([{ name: 'Player 1', ai: false }]);
  const [tab, setTab] = useState<WordSearchDifficulty>('easy');
  const [themeFilter, setThemeFilter] = useState('');
  const [boardNo, setBoardNo] = useState(1);
  const [timed, setTimed] = useState<boolean | null>(null);
  const [customText, setCustomText] = useState('');
  const [customDiff, setCustomDiff] = useState<WordSearchDifficulty>('medium');
  const [game, setGame] = useState<WordSearchState | null>(null);
  const [daily, setDaily] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<{ cells: number[]; ok: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [bests, setBests] = useState<Record<number, number>>({});

  useEffect(() => {
    const s = readJSON<Saved | null>(SAVE_KEY, null);
    if (s?.state?.status === 'playing' && Array.isArray(s.state.scores)) setSaved(s);
    setBests(readJSON<Record<number, number>>('word_search_bests', {}));
  }, []);

  const begin = (state: WordSearchState, opts: { elapsed?: number; daily?: string | null } = {}) => {
    setGame(state); setElapsed(opts.elapsed ?? 0); setDaily(opts.daily ?? null); setPaused(false); setFlash(null);
    setMessage(state.players.length > 1 ? `${state.players[state.currentPlayerIndex].name}'s turn.` : 'Find all the words!');
  };

  const players = () => seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || `Player ${i + 1}`, s.ai, s.ai ? 'medium' : undefined));
  const timedFor = (d: WordSearchDifficulty) => timed ?? WORD_SEARCH_LEVELS[d].timedByDefault;

  const startBoard = (n: number, round?: number, dailyKey: string | null = null) => {
    const b = getWordSearchBoard(n);
    begin(engine.initialize(players(), { board: n, round, timed: timedFor(b.difficulty) }), { daily: dailyKey });
  };
  const startDaily = () => { const d = dailyChallenge(); startBoard(d.board, d.round, d.key); };
  const startCustom = () => {
    const words = customText.split(/[\s,;]+/).map((w) => w.toUpperCase().replace(/[^A-Z]/g, '')).filter((w) => w.length >= 2);
    if (words.length < 2) { setMessage('Enter at least 2 words (letters only).'); return; }
    begin(engine.initialize(players(), { words, difficulty: customDiff, theme: 'Custom', timed: timedFor(customDiff) }));
  };

  // Persist progress
  useEffect(() => {
    if (!game) return;
    if (game.status === 'playing') localStorage.setItem(SAVE_KEY, JSON.stringify({ state: game, elapsed, daily } satisfies Saved));
    else localStorage.removeItem(SAVE_KEY);
  }, [game, elapsed, daily]);

  // Clock
  const running = !!game && game.status === 'playing' && !paused;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (game?.status === 'playing' && game.timeLimitSec && elapsed >= game.timeLimitSec) {
      setGame(engine.expire(game));
      setMessage('⏰ Time is up!');
    }
  }, [elapsed, game]);

  // Personal best + local leaderboard when a round ends
  const recorded = useRef<WordSearchState | null>(null);
  useEffect(() => {
    if (!game || game.status !== 'finished' || recorded.current === game || game.boardNumber === null) return;
    recorded.current = game;
    const n = game.boardNumber;
    const top = Math.max(...game.scores);
    const nextBests = { ...readJSON<Record<number, number>>('word_search_bests', {}) };
    if (!game.timedOut || game.players.length > 1) nextBests[n] = Math.max(nextBests[n] ?? 0, top);
    localStorage.setItem('word_search_bests', JSON.stringify(nextBests));
    setBests(nextBests);
    const key = `word_search_scores_${n}`;
    const list = readJSON<ScoreEntry[]>(key, []);
    game.players.forEach((p, i) => { if (!p.isAI) list.push({ name: p.name, score: game.scores[i], time: elapsed, date: new Date().toISOString().slice(0, 10) }); });
    localStorage.setItem(key, JSON.stringify(list.sort((a, b) => b.score - a.score || a.time - b.time).slice(0, 10)));
  }, [game, elapsed]);

  const submit = useCallback((start: number, end: number) => {
    setGame((g) => {
      if (!g || g.status !== 'playing') return g;
      if (!engine.isValidMove(g, { start, end }, g.currentPlayerIndex)) {
        setMessage('Selections must be a straight line (across, down or diagonal).');
        return g;
      }
      const next = engine.applyMove(g, { start, end });
      const r = next.lastResult!;
      const who = g.players[r.playerIndex].name;
      setFlash({ cells: r.positions, ok: !!r.word });
      if (r.word) {
        setMessage(next.status === 'finished'
          ? `🎉 ${g.players.length > 1 ? `${who} found ${r.word}. ` : ''}Puzzle complete! +${r.points}`
          : `✅ ${g.players.length > 1 ? `${who}: ` : ''}${r.word} +${r.points}`);
      } else {
        setMessage(g.players.length > 1 ? `❌ Not a hidden word. ${next.players[next.currentPlayerIndex].name}'s turn.` : '❌ Not a hidden word — try again.');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  // Bot turns
  const botTurn = !!game && game.status === 'playing' && !paused && game.players[game.currentPlayerIndex].isAI;
  useEffect(() => {
    if (!botTurn || !game) return;
    const t = setTimeout(() => {
      const m = engine.getAIMove(game, game.players[game.currentPlayerIndex].difficulty ?? 'medium');
      submit(m.start, m.end);
    }, 1400);
    return () => clearTimeout(t);
  }, [botTurn, game, submit]);

  const hint = () => {
    if (!game) return;
    const next = engine.useHint(game);
    setGame(next);
    if (next.hint) setMessage(`💡 ${next.hint.word} starts at the flashing letter (-25).`);
  };

  const resize = (n: number) => setSeats((s) => Array.from({ length: n }, (_, i) => s[i] ?? { name: `Player ${i + 1}`, ai: i > 0 }));
  const updateSeat = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const boards = useMemo(() => getWordSearchBoards(tab, themeFilter || undefined), [tab, themeFilter]);

  if (!game) {
    const level = WORD_SEARCH_LEVELS[tab];
    const today = dailyChallenge();
    const preview = getWordSearchBoard(boardNo);
    return (
      <Shell onBack={onBack}>
        <section className="space-y-2">
          <h2>Players</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold">Players:
              <select value={seats.length} onChange={(e) => resize(Number(e.target.value))} className="ml-2 rounded border px-2 py-1">
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? '1 (solo)' : n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={timed ?? level.timedByDefault} onChange={(e) => setTimed(e.target.checked)} /> Timed mode (countdown)
            </label>
          </div>
          {seats.length > 1 && (
            <ul className="space-y-2">
              {seats.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="h-6 w-6 shrink-0 rounded-full border-2 border-black" style={{ background: COLORS[i] }} title={BOT_COLOR_NAMES[i]} />
                  <input value={s.name} maxLength={20} onChange={(e) => updateSeat(i, { name: e.target.value })} className="flex-1 rounded border px-2 py-1" aria-label={`Player ${i + 1} name`} />
                  <select value={s.ai ? 'ai' : 'human'} onChange={(e) => updateSeat(i, { ai: e.target.value === 'ai' })} className="rounded border px-2 py-1" aria-label={`Player ${i + 1} type`}>
                    <option value="human">Human</option><option value="ai">Bot</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </section>

        {saved && <button onClick={() => begin(saved.state, { elapsed: saved.elapsed, daily: saved.daily })} className="btn btn-outline w-full">Resume saved game (Board {saved.state.boardNumber ?? 'Custom'})</button>}

        <button onClick={startDaily} className="btn btn-primary w-full">📅 Daily Challenge — {today.key} (Board {today.board}, {WORD_SEARCH_LEVELS[getWordSearchBoard(today.board).difficulty].label})</button>

        <section className="space-y-3">
          <h2>Choose a board (1-{WORD_SEARCH_BOARD_COUNT})</h2>
          <div className="flex flex-wrap gap-2" role="tablist">
            {WORD_SEARCH_DIFFICULTIES.map((d) => (
              <button key={d} role="tab" aria-selected={tab === d} onClick={() => { setTab(d); setBoardNo(WORD_SEARCH_LEVELS[d].boards[0]); }}
                className={`btn btn-sm ${tab === d ? 'btn-primary' : 'btn-outline'}`}>
                {WORD_SEARCH_LEVELS[d].label} · {WORD_SEARCH_LEVELS[d].boards[0]}-{WORD_SEARCH_LEVELS[d].boards[1]}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{level.tagline}: {level.features.join(' · ')}</p>
          <label className="block text-sm font-semibold">Category:
            <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)} className="ml-2 rounded border px-2 py-1">
              <option value="">All categories</option>
              {WORD_SEARCH_THEMES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </label>
          <div className="grid max-h-64 grid-cols-5 gap-1 overflow-y-auto rounded-lg border-2 border-border p-2 sm:grid-cols-8">
            {boards.map((b) => (
              <button key={b.number} onClick={() => setBoardNo(b.number)} title={`${b.theme} — ${b.bank.length} words`}
                className={`rounded border-2 px-1 py-1 text-xs font-bold ${boardNo === b.number ? 'border-primary bg-primary text-onPrimary' : 'border-border'}`}>
                {b.number}{bests[b.number] ? ' ★' : ''}
              </button>
            ))}
          </div>
          <div className="rounded-lg border-2 border-border p-3 text-sm">
            <p className="font-bold">Board {preview.number} · {preview.theme} · {WORD_SEARCH_LEVELS[preview.difficulty].label} · {preview.bank.length}-word bank
              {bests[preview.number] ? ` · Best: ${bests[preview.number]}` : ''}</p>
            <p className="mt-1 text-muted">{preview.bank.join(', ')}</p>
            <p className="mt-1 text-xs text-muted">Each round hides {WORD_SEARCH_LEVELS[preview.difficulty].wordCount} words from this bank — replay for a new puzzle.</p>
          </div>
          <button onClick={() => startBoard(boardNo)} className="btn btn-primary w-full">▶ Play Board {boardNo}</button>
        </section>

        <details className="rounded-lg border-2 border-border p-3">
          <summary className="cursor-pointer font-bold">✏️ Custom puzzle</summary>
          <div className="mt-2 space-y-2">
            <textarea value={customText} onChange={(e) => setCustomText(e.target.value)} rows={3} className="input min-h-[80px] py-2"
              placeholder="Type your words separated by spaces or commas, e.g. APPLE BANANA ORANGE MANGO GRAPES" />
            <div className="flex flex-wrap items-center gap-2">
              <select value={customDiff} onChange={(e) => setCustomDiff(e.target.value as WordSearchDifficulty)} className="rounded border px-2 py-1" aria-label="Custom puzzle difficulty">
                {WORD_SEARCH_DIFFICULTIES.map((d) => <option key={d} value={d}>{WORD_SEARCH_LEVELS[d].label}</option>)}
              </select>
              <button onClick={startCustom} className="btn btn-outline btn-sm">Create puzzle</button>
            </div>
          </div>
        </details>
        {message && <p className="font-semibold" aria-live="polite">{message}</p>}
        <Rulebook title="Word Search Rulebook" sections={WORD_SEARCH_RULES} />
      </Shell>
    );
  }

  const level = WORD_SEARCH_LEVELS[game.difficulty];
  const remaining = game.timeLimitSec ? game.timeLimitSec - elapsed : null;
  const found = game.words.filter((w) => w.found).length;
  const accuracy = game.selections ? Math.round((game.correctSelections / game.selections) * 100) : 100;
  const current = game.players[game.currentPlayerIndex];
  const multi = game.players.length > 1;
  const scores = game.boardNumber ? readJSON<ScoreEntry[]>(`word_search_scores_${game.boardNumber}`, []).slice(0, 5) : [];
  const winnerText = game.status === 'finished'
    ? multi
      ? game.winner === null ? 'It’s a tie!' : `🏆 ${game.players[game.winner].name} wins!`
      : game.timedOut ? `Time’s up — you found ${found} of ${game.words.length}.` : `🎉 Completed in ${fmt(elapsed)}!`
    : '';

  return (
    <Shell onBack={onBack} wide>
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-border p-3">
        <div>
          <p className="text-lg font-extrabold">{game.boardNumber ? `Board ${game.boardNumber}` : 'Custom puzzle'} · {game.theme}{daily ? ` · Daily ${daily}` : ''}</p>
          <p className="text-sm text-muted">{level.label} ({level.tagline}) · {game.gridSize} × {game.gridSize}</p>
        </div>
        <div className="flex items-center gap-4 text-lg font-bold">
          <span aria-label="Timer" className={remaining !== null && remaining <= 30 ? 'text-red-600' : ''}>⏱ {remaining !== null ? fmt(remaining) : fmt(elapsed)}</span>
          <span aria-label="Score">⭐ {multi ? game.scores[game.currentPlayerIndex] : game.scores[0]}</span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[180px_1fr_200px]">
        <aside className="order-2 lg:order-1">
          <h2 className="mb-1 text-base">Words ({found}/{game.words.length})</h2>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {game.words.map((w) => (
              <li key={w.word} className={`rounded px-2 py-0.5 text-sm font-bold ${w.found ? 'line-through opacity-60' : ''}`}
                style={w.found ? { background: `${COLORS[w.foundBy ?? 0]}33` } : undefined}>
                {paused ? '•••' : w.word}{w.hinted && !w.found ? ' 💡' : ''}
              </li>
            ))}
          </ul>
        </aside>

        <div className="order-1 lg:order-2">
          <Grid game={game} paused={paused} flash={flash} disabled={botTurn || game.status !== 'playing' || paused} onSelect={submit} />
          <p className="mt-2 min-h-6 text-center font-semibold" aria-live="polite">{winnerText || message}</p>
        </div>

        <aside className="order-3 space-y-3 text-sm">
          <div className="rounded-lg border-2 border-border p-2">
            <h2 className="mb-1 text-base">{multi ? 'Players' : 'Stats'}</h2>
            {multi ? (
              <ul className="space-y-1">
                {game.players.map((p, i) => (
                  <li key={p.id} className={`flex items-center justify-between rounded px-1 font-bold ${i === game.currentPlayerIndex && game.status === 'playing' ? 'ring-2 ring-primary' : ''}`}>
                    <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[i] }} />{p.name}{p.isAI ? ' 🤖' : ''}</span>
                    <span>{game.scores[i]} · {game.wordsFoundBy[i]}w</span>
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="grid grid-cols-2 gap-1">
                <dt>Found</dt><dd className="font-bold">{found}</dd>
                <dt>Remaining</dt><dd className="font-bold">{game.words.length - found}</dd>
                <dt>Accuracy</dt><dd className="font-bold">{accuracy}%</dd>
                <dt>Hints used</dt><dd className="font-bold">{game.hintsUsed}</dd>
                {game.boardNumber && <><dt>Best</dt><dd className="font-bold">{bests[game.boardNumber] ?? '—'}</dd></>}
              </dl>
            )}
          </div>
          <button onClick={hint} disabled={game.status !== 'playing' || paused || botTurn} className="btn btn-outline btn-sm w-full disabled:opacity-50">💡 Hint (-25)</button>
          {multi && game.status === 'playing' && !current.isAI && (
            <button onClick={() => { const n = engine.passTurn(game); setGame(n); setMessage(`${n.players[n.currentPlayerIndex].name}'s turn.`); }} className="btn btn-outline btn-sm w-full">Pass turn</button>
          )}
          {scores.length > 0 && (
            <div className="rounded-lg border-2 border-border p-2">
              <h2 className="mb-1 text-base">🏆 Leaderboard</h2>
              <ol className="ml-4 list-decimal">
                {scores.map((s, i) => <li key={i}>{s.name} — {s.score} ({fmt(s.time)})</li>)}
              </ol>
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPaused((p) => !p)} disabled={game.status !== 'playing'} className="btn btn-outline flex-1 disabled:opacity-50">{paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button onClick={() => (game.boardNumber ? startBoard(game.boardNumber, undefined, null) : startCustom())} className="btn btn-outline flex-1">🔄 New round</button>
        {game.boardNumber && game.boardNumber < WORD_SEARCH_BOARD_COUNT && game.status === 'finished' && (
          <button onClick={() => { setBoardNo(game.boardNumber! + 1); startBoard(game.boardNumber! + 1); }} className="btn btn-primary flex-1">Next board ▶</button>
        )}
        <button onClick={() => { setGame(null); setSaved(game.status === 'playing' ? { state: game, elapsed, daily } : null); }} className="btn btn-outline flex-1">✖ Quit</button>
      </div>
      <Rulebook title="Word Search Rulebook" sections={WORD_SEARCH_RULES} />
    </Shell>
  );
}

function Grid({ game, paused, flash, disabled, onSelect }: {
  game: WordSearchState; paused: boolean; flash: { cells: number[]; ok: boolean } | null; disabled: boolean;
  onSelect: (start: number, end: number) => void;
}) {
  const size = game.gridSize;
  const [start, setStart] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [px, setPx] = useState(400);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setStart(null); setHover(null); }, [game.grid]);

  const owner = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of game.words) if (w.found) for (const p of w.positions) if (!m.has(p)) m.set(p, w.foundBy ?? 0);
    return m;
  }, [game.words]);

  const preview = start !== null && hover !== null ? selectionPath(start, hover, size) ?? [start] : start !== null ? [start] : [];
  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const idx = el?.dataset.idx;
    return idx === undefined ? null : Number(idx);
  };

  const down = (e: React.PointerEvent, i: number) => {
    if (disabled) return;
    e.preventDefault();
    if (start !== null && start !== i && !dragging) { onSelect(start, i); setStart(null); setHover(null); return; }
    setStart(i); setHover(i); setDragging(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i !== null) setHover(i);
  };
  const up = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    const i = cellAt(e.clientX, e.clientY) ?? hover;
    if (start !== null && i !== null && i !== start) { onSelect(start, i); setStart(null); setHover(null); }
    // a tap without dragging keeps the start cell selected: tap the last letter next
  };

  const font = Math.max(10, Math.min(28, (px / size) * 0.55));
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[640px] select-none rounded-xl border-4 border-amber-700 bg-amber-50 p-1 text-black shadow-lg"
      style={{ touchAction: 'none' }} onPointerMove={move} onPointerUp={up} onPointerLeave={() => dragging && setHover(null)}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }} role="grid" aria-label="Letter grid">
        {game.grid.map((ch, i) => {
          const o = owner.get(i);
          const sel = preview.includes(i);
          const fl = flash?.cells.includes(i);
          const isHint = game.hint?.cell === i && game.status === 'playing';
          const bg = fl ? (flash!.ok ? '#86efac' : '#fca5a5') : sel ? '#fde047' : o !== undefined ? `${COLORS[o]}66` : undefined;
          return (
            <div key={i} data-idx={i} role="gridcell" onPointerDown={(e) => down(e, i)}
              className={`flex aspect-square cursor-pointer items-center justify-center rounded font-extrabold transition-colors ${isHint ? 'animate-pulse ring-4 ring-orange-500' : ''}`}
              style={{ fontSize: font, background: bg }}>
              {paused ? '' : ch}
            </div>
          );
        })}
      </div>
      {paused && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-2xl font-bold text-white">⏸ Paused</div>}
    </div>
  );
}

function Shell({ onBack, children, wide = false }: { onBack: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto space-y-4 p-4 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <button onClick={onBack} className="text-secondary">← Back to Word Search</button>
      <div className="card space-y-4 p-5">
        <h1>🔤 Word Search</h1>
        {children}
      </div>
    </main>
  );
}
