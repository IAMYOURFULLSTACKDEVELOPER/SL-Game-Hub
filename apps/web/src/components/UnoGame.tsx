'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  UnoEngine, unoViewFor, UNO_COLORS, UNO_RULES, cardLabel, createPlayer,
  type UnoState, type UnoMove, type UnoView, type Card, type PlayColor, type Difficulty,
} from '@slgh/shared';
import Rulebook from './Rulebook';
import { RoomLobby } from './RoomLobby';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { Portal } from './Portal';
import { useRoom } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new UnoEngine();
const SAVE_KEY = 'uno_game_state_v2';
const COLOR_NAME: Record<PlayColor, string> = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };

type Mode = 'bots' | 'pass' | 'online';
interface Seat { name: string; ai: boolean }

export default function UnoGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('bots');
  // A shared room link opens straight into online play.
  useEffect(() => { if (new URLSearchParams(location.search).has('room')) setMode('online'); }, []);
  return (
    <Shell onBack={onBack}>
      <div role="tablist" aria-label="How to play" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-bg/60 p-1">
        {([['bots', 'vs Bots', 'gamepad'], ['pass', 'Pass & play', 'users'], ['online', 'Online', 'globe']] as const).map(([m, label, icon]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all ${mode === m ? 'bg-surface text-primary shadow-soft' : 'text-muted'}`}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>
      {mode === 'online' ? <ConvexRoomProvider><OnlineUno /></ConvexRoomProvider> : <LocalUno key={mode} pass={mode === 'pass'} />}
      <Rulebook title="UNO Rulebook" sections={UNO_RULES} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Local: vs bots, or several people sharing one phone                  */
/* ------------------------------------------------------------------ */

function LocalUno({ pass }: { pass: boolean }) {
  const [state, setState] = useState<UnoState | null>(null);
  const [saved, setSaved] = useState<UnoState | null>(null);
  const [seats, setSeats] = useState<Seat[]>(pass
    ? [{ name: 'Player 1', ai: false }, { name: 'Player 2', ai: false }]
    : [{ name: 'You', ai: false }, { name: 'Bot 1', ai: true }]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [shownTo, setShownTo] = useState<number | null>(null);

  useEffect(() => {
    if (pass) return;
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const s = engine.deserialize(raw); if (s.status === 'playing') setSaved(s); } } catch { /* ignore */ }
  }, [pass]);
  useEffect(() => {
    if (!state || pass) return;
    try { if (state.status === 'playing') localStorage.setItem(SAVE_KEY, engine.serialize(state)); else localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }, [state, pass]);

  // Bots take their turn after a short pause so you can follow what happened.
  const botTurn = !!state && state.status === 'playing' && state.players[state.currentPlayerIndex].isAI;
  useEffect(() => {
    if (!botTurn || !state) return;
    const t = setTimeout(() => setState((s) => (s && s.status === 'playing' && s.players[s.currentPlayerIndex].isAI
      ? engine.applyMove(s, engine.getAIMove(s, s.players[s.currentPlayerIndex].difficulty ?? 'medium')) : s)), 1000);
    return () => clearTimeout(t);
  }, [botTurn, state]);

  const start = () => {
    sfx('shuffle');
    setState(engine.initialize(seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || `Player ${i + 1}`, s.ai, s.ai ? difficulty : undefined))));
    setShownTo(null);
  };

  if (!state) {
    const resize = (n: number) => setSeats((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? (pass ? { name: `Player ${i + 1}`, ai: false } : { name: `Bot ${i}`, ai: true })));
    return (
      <div className="space-y-4">
        <UnoHero />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">Players
            <select className="field" value={seats.length} onChange={(e) => resize(Number(e.target.value))}>
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {seats.some((s) => s.ai) && (
            <label className="flex items-center gap-2 text-sm font-semibold">Bot level
              <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </label>
          )}
        </div>
        {pass && (
          <ul className="space-y-2">
            {seats.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="avatar-ring h-8 w-8 shrink-0 text-sm font-bold">{i + 1}</span>
                <input className="field min-w-0 flex-1" maxLength={20} value={s.name} aria-label={`Player ${i + 1} name`}
                  onChange={(e) => setSeats((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <select className="field" value={s.ai ? 'ai' : 'human'} aria-label={`Player ${i + 1} type`}
                  onChange={(e) => setSeats((p) => p.map((x, j) => (j === i ? { ...x, ai: e.target.value === 'ai' } : x)))}>
                  <option value="human">Person</option><option value="ai">Bot</option>
                </select>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary btn-lg w-full" onClick={start} disabled={seats.every((s) => s.ai)}><Icon name="play" size={20} />Deal the cards</button>
        {saved && <button className="btn btn-outline w-full" onClick={() => { setState(saved); setSaved(null); }}>Resume saved game</button>}
      </div>
    );
  }

  const humans = state.players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0);
  const current = state.currentPlayerIndex;
  // vs bots: always your cards. Pass & play: only the person whose turn it is, after they tap to see them.
  const seat = humans.length === 1 ? humans[0] : state.players[current].isAI || state.status !== 'playing' ? -1 : current;
  const needsHandover = humans.length > 1 && seat >= 0 && shownTo !== seat;

  return (
    <div className="space-y-3">
      {needsHandover ? (
        <div className="flash grid place-items-center gap-4 rounded-3xl border border-border bg-gradient-to-br from-primary/15 to-secondary/15 p-8 text-center">
          <UnoBack size="lg" />
          <p className="font-display text-2xl font-bold">Pass the phone to {state.players[seat].name}</p>
          <p className="text-muted">Only {state.players[seat].name} should look at the screen.</p>
          <button className="btn btn-primary btn-lg" onClick={() => { sfx('card'); setShownTo(seat); }}>I&apos;m {state.players[seat].name}: show my cards</button>
        </div>
      ) : (
        <UnoTable view={unoViewFor(state, seat)} onMove={(m) => setState((s) => (s ? engine.applyMove(s, m) : s))} />
      )}
      <div className="flex gap-2">
        <button className="btn btn-outline flex-1" onClick={start}>Restart</button>
        <button className="btn btn-outline flex-1" onClick={() => setState(null)}>New setup</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Online: the server holds the deck and only sends us our own hand     */
/* ------------------------------------------------------------------ */

function OnlineUno() {
  const room = useRoom('uno');
  const v = room.view;
  const state = (v?.state ?? null) as UnoView | null;
  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && state?.status === 'playing';
  return (
    <div className="space-y-4">
      {room.joined && state && <UnoTable view={state} busy={room.busy} onMove={(m) => { room.move(m); }} />}
      {room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>}
      {!playing && <RoomLobby room={room} title="UNO" maxSeats={4} />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm('Leave this game? A bot will take your seat.')) room.leave(); }}><Icon name="logout" size={18} />Leave game</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The table: same for every mode, drawn from one player's view          */
/* ------------------------------------------------------------------ */

function UnoTable({ view: v, onMove, busy = false }: { view: UnoView; onMove: (m: UnoMove) => void; busy?: boolean }) {
  const [wildFor, setWildFor] = useState<string | null>(null);
  const [unoArmed, setUnoArmed] = useState(false);
  const myTurn = v.seat >= 0 && v.currentPlayerIndex === v.seat && v.status === 'playing' && !busy;
  const n = v.players.length;
  const over = v.status === 'finished';

  // One sound per action, and the UNO button resets every turn.
  const lastTurn = useRef(v.turn);
  useEffect(() => {
    if (v.turn === lastTurn.current) return;
    lastTurn.current = v.turn;
    setUnoArmed(false);
    const e = v.lastEvent;
    if (e?.kind === 'play' || e?.kind === 'draw') sfx('card');
    if (e?.kind === 'penalty') sfx('error');
    if (e?.kind === 'pass') sfx('click');
  }, [v.turn, v.lastEvent]);
  useEndSfx(over, v.seat >= 0 && v.winner !== v.seat);

  const play = (card: Card) => {
    if (!myTurn || !v.playable.includes(card.id)) { sfx('error'); return; }
    if (card.color === 'wild') { setWildFor(card.id); return; }
    onMove({ type: 'play', cardId: card.id, uno: unoArmed });
  };
  const status = over
    ? `${v.players[v.winner!].name} wins!`
    : myTurn
      ? v.drawnCardId ? 'You drew a card you can play. Play it, or keep it.' : v.playable.length ? `Your turn: match ${COLOR_NAME[v.currentColor].toLowerCase()} or ${v.top.type === 'number' ? v.top.value : cardLabel(v.top).replace(/^\w+ /, '')}` : 'No match: draw a card.'
      : `${v.players[v.currentPlayerIndex].name} is playing…`;

  // Opponents in seat order, starting after you.
  const others = v.seat >= 0 ? Array.from({ length: n - 1 }, (_, k) => (v.seat + k + 1) % n) : Array.from({ length: n }, (_, i) => i);

  return (
    <div className="space-y-3">
      {/* opponents */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {others.map((i) => {
          const turn = v.currentPlayerIndex === i && !over;
          const count = v.handCounts[i];
          return (
            <div key={i} className={`flex min-w-[6.5rem] flex-1 items-center gap-2 rounded-2xl border p-2 transition-all ${turn ? 'uno-turn border-primary bg-primary/10' : 'border-border bg-surface/70'}`}>
              <span className="avatar-ring h-9 w-9 shrink-0 font-display font-bold">{v.players[i].isAI ? <Icon name="gamepad" size={16} /> : v.players[i].name[0]?.toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{v.players[i].name}</p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <span className="uno-mini-back" aria-hidden />{count} {count === 1 ? 'card' : 'cards'}
                  {count === 1 && !over && <span className="uno-badge">UNO</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* table */}
      <div className="uno-felt relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col items-center gap-1">
          <button type="button" aria-label={v.canDraw ? 'Draw a card' : `Draw pile, ${v.deckCount} cards`} disabled={!v.canDraw || !myTurn}
            onClick={() => onMove({ type: 'draw' })} className={`uno-deck ${v.canDraw && myTurn ? 'is-live' : ''}`}>
            <UnoBack size="md" /><UnoBack size="md" /><UnoBack size="md" />
          </button>
          <span className="text-xs font-semibold text-white/80">{v.deckCount} left</span>
        </div>
        <div className="relative grid place-items-center">
          <span className="uno-ring" style={{ ['--ring' as string]: `var(--uno-${v.currentColor})` }} aria-hidden />
          <span className={`uno-direction ${v.direction === -1 ? 'is-reversed' : ''}`} aria-label={v.direction === 1 ? 'Clockwise' : 'Anticlockwise'}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
              <path d="M50 6a44 44 0 0 1 40 26M94 50a44 44 0 0 1-26 40M50 94a44 44 0 0 1-40-26M6 50a44 44 0 0 1 26-40" />
              <path d="m86 22 4 10-10 1M78 86l-10 4-1-10M14 78l-4-10 10-1M22 14l10-4 1 10" />
            </svg>
          </span>
          <div className="relative">
            {v.recent.slice(0, -1).map((c, i) => (
              <div key={c.id} className="absolute inset-0" style={{ transform: `rotate(${(i - 1.5) * 9}deg) translate(${(i - 1) * 3}px, ${(i % 2) * 3}px)` }}>
                <UnoCard card={c} size="lg" />
              </div>
            ))}
            <div key={v.top.id} className="uno-drop relative"><UnoCard card={v.top} size="lg" /></div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-center text-white">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">Colour</span>
          <span className="h-8 w-8 rounded-full border-2 border-white shadow-lg transition-colors duration-500" style={{ background: `var(--uno-${v.currentColor})` }} />
          <span className="text-sm font-bold">{COLOR_NAME[v.currentColor]}</span>
        </div>
      </div>

      <p className="min-h-[1.5rem] text-center font-semibold" aria-live="polite">{status}</p>
      {v.log.length > 0 && !over && <p className="-mt-2 text-center text-sm text-muted">{v.log[v.log.length - 1]}</p>}

      {/* actions */}
      {myTurn && (
        <div className="flex flex-wrap justify-center gap-2">
          {v.canPass && <button className="btn btn-outline" onClick={() => onMove({ type: 'pass' })}>Keep it and pass</button>}
          {v.hand.length === 2 && v.playable.length > 0 && (
            <button type="button" aria-pressed={unoArmed} onClick={() => { setUnoArmed((a) => !a); sfx(unoArmed ? 'toggleOff' : 'toggleOn'); }}
              className={`uno-call ${unoArmed ? 'is-armed' : ''}`}>
              {unoArmed ? 'UNO! ✓' : 'Call UNO!'}
            </button>
          )}
        </div>
      )}
      {myTurn && v.hand.length === 2 && v.playable.length > 0 && !unoArmed && (
        <p className="-mt-1 text-center text-xs text-muted">Going down to one card? Call UNO before you play, or draw 2.</p>
      )}

      {/* your hand */}
      {v.seat >= 0 && <Hand cards={v.hand} playable={myTurn ? v.playable : null} drawnId={v.drawnCardId} onPlay={play} />}

      {/* wild colour picker */}
      {wildFor && (
        <Portal><div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Choose a colour" onClick={() => setWildFor(null)}>
          <div className="pop-in w-full max-w-xs rounded-3xl bg-surface p-5 text-center shadow-lift" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl font-bold">Choose a colour</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {UNO_COLORS.map((c) => (
                <button key={c} className="uno-swatch" style={{ background: `var(--uno-${c})` }}
                  onClick={() => { onMove({ type: 'play', cardId: wildFor, color: c, uno: unoArmed }); setWildFor(null); }}>{COLOR_NAME[c]}</button>
              ))}
            </div>
            <button className="btn btn-ghost mt-3 w-full" onClick={() => setWildFor(null)}>Cancel</button>
          </div>
        </div></Portal>
      )}

      {/* results */}
      {over && (
        <div className="flash space-y-3 rounded-3xl border border-accent/40 bg-accent/10 p-5 text-center">
          <p className="text-4xl" aria-hidden>{v.seat >= 0 && v.winner === v.seat ? '🏆' : '🃏'}</p>
          <h2>{v.seat >= 0 && v.winner === v.seat ? 'You win!' : `${v.players[v.winner!].name} wins!`}</h2>
          <p className="text-muted">{v.scores?.[v.winner!] ?? 0} points from the cards left in other hands.</p>
          {v.revealed && (
            <div className="space-y-2 text-left">
              {v.revealed.map((h, i) => h.length > 0 && (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-sm font-semibold">{v.players[i].name}</span>
                  <div className="flex flex-wrap gap-1">{h.map((c) => <UnoCard key={c.id} card={c} size="sm" />)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Your hand: fans out to fit the screen, playable cards lift up. */
function Hand({ cards, playable, drawnId, onPlay }: { cards: Card[]; playable: string[] | null; drawnId: string | null; onPlay: (c: Card) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const cardW = width < 420 ? 64 : 84;
  const overlap = cards.length > 1 ? Math.max(0, (cards.length * cardW - (width - 8)) / (cards.length - 1)) : 0;
  // Group by colour so the hand is easy to read
  const order: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
  const sorted = [...cards].sort((a, b) => order[a.color] - order[b.color] || (a.value ?? 10) - (b.value ?? 10));
  return (
    <div ref={box} className="flex min-h-[140px] items-end justify-center pt-4" aria-label={`Your hand, ${cards.length} cards`}>
      {sorted.map((c, i) => {
        const can = playable?.includes(c.id) ?? false;
        return (
          <button key={c.id} type="button" onClick={() => onPlay(c)} aria-label={`${cardLabel(c)}${can ? ', playable' : ''}`}
            className={`uno-hand-card ${can ? 'is-playable' : playable ? 'is-dim' : ''} ${c.id === drawnId ? 'is-drawn' : ''}`}
            style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: i, ['--i' as string]: i }}>
            <div className="uno-deal"><UnoCard card={c} size={cardW < 70 ? 'md' : 'lg'} /></div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cards, drawn in CSS                                                  */
/* ------------------------------------------------------------------ */

function CardSymbol({ card, big = false }: { card: Card; big?: boolean }) {
  switch (card.type) {
    case 'number': return card.value === 6 || card.value === 9 ? <span className="underline decoration-[0.08em] underline-offset-[0.12em]">{card.value}</span> : <>{card.value}</>;
    case 'skip': return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="m6 18 12-12" /></svg>;
    case 'reverse': return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 9h13l-3-3M20 15H7l3 3" /></svg>;
    case 'draw_two': return <>+2</>;
    case 'wild_draw_four': return big ? <span className="flex flex-col items-center leading-none"><WildDisc small /><span className="mt-0.5">+4</span></span> : <>+4</>;
    case 'wild': return big ? <WildDisc /> : <>W</>;
  }
}
const WildDisc = ({ small = false }: { small?: boolean }) => (
  <svg viewBox="0 0 20 20" width={small ? '0.9em' : '1.4em'} height={small ? '0.9em' : '1.4em'} aria-hidden>
    <path d="M10 10V0a10 10 0 0 1 10 10z" fill="var(--uno-red)" /><path d="M10 10h10a10 10 0 0 1-10 10z" fill="var(--uno-yellow)" />
    <path d="M10 10v10A10 10 0 0 1 0 10z" fill="var(--uno-green)" /><path d="M10 10H0A10 10 0 0 1 10 0z" fill="var(--uno-blue)" />
  </svg>
);

export function UnoCard({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`uno-card uno-${size}`} style={{ ['--uno' as string]: card.color === 'wild' ? 'var(--uno-wild)' : `var(--uno-${card.color})` }}>
      <span className="uno-corner uno-tl"><CardSymbol card={card} /></span>
      <span className="uno-disc"><CardSymbol card={card} big /></span>
      <span className="uno-corner uno-br"><CardSymbol card={card} /></span>
    </div>
  );
}

function UnoBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`uno-card uno-back uno-${size}`} aria-hidden><span className="uno-back-logo">SL</span></div>;
}

function UnoHero() {
  const fan: Card[] = [
    { id: 'h1', color: 'red', type: 'number', value: 7 }, { id: 'h2', color: 'yellow', type: 'skip' },
    { id: 'h3', color: 'wild', type: 'wild' }, { id: 'h4', color: 'green', type: 'reverse' }, { id: 'h5', color: 'blue', type: 'draw_two' },
  ];
  return (
    <div className="uno-felt flex justify-center rounded-3xl px-4 pb-4 pt-8">
      {fan.map((c, i) => (
        <div key={c.id} className="uno-hero-card" style={{ ['--i' as string]: i, transform: `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 8}px)`, marginLeft: i ? -14 : 0 }}>
          <UnoCard card={c} size="md" />
        </div>
      ))}
    </div>
  );
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={onBack} className="back-link">← Back to UNO</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>🃏 UNO</h1>
        {children}
      </div>
    </main>
  );
}
