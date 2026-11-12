'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SalonePolyEngine, SALONE_POLY_BOARD, SALONE_POLY_GROUPS, SALONE_POLY, SALONE_POLY_RULES,
  actor, netWorth, unmortgageCost, createPlayer,
  type SalonePolyState, type SalonePolyMove, type TradeSide, type Difficulty, type BoardSpace,
} from '@slgh/shared';
import Rulebook from './Rulebook';
import Die3D from './Die3D';
import { RoomLobby } from './RoomLobby';
import { ConvexRoomProvider } from './ConvexRoomProvider';
import { Icon } from './Icon';
import { Portal } from './Portal';
import { useRoom } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new SalonePolyEngine();
const SAVE_KEY = 'salone_poly_state_v1';
const PAWNS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'];
const leones = (n: number) => `Le${n.toLocaleString('en-US')}`;
const EMPTY: TradeSide = { spaces: [], cash: 0, jailCards: 0 };
type TradeMove = Extract<SalonePolyMove, { type: 'trade' }>;
type TradeResult = 'accepted' | 'declined' | 'pending' | 'error';

/* Board geometry: 11×11 grid, corners 1.6× wider. Start bottom right, play runs clockwise. */
const CELL: [number, number][] = (() => {
  const c: [number, number][] = new Array(40);
  for (let i = 0; i <= 10; i++) c[i] = [10, 10 - i];
  for (let i = 11; i <= 20; i++) c[i] = [20 - i, 0];
  for (let i = 21; i <= 30; i++) c[i] = [0, i - 20];
  for (let i = 31; i <= 39; i++) c[i] = [i - 30, 10];
  return c;
})();
const SIDE = (i: number) => (i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');
const UNITS = 1.6 * 2 + 9;
const centre = (k: number) => ((k === 0 ? 0.8 : k === 10 ? UNITS - 0.8 : 1.6 + (k - 1) + 0.5) / UNITS) * 100;
const ICON: Record<number, string> = { 2: '🪙', 17: '🪙', 33: '🪙', 7: '❓', 22: '❓', 36: '❓', 4: '🧾', 38: '🧺', 5: '⛴️', 15: '🚐', 25: '✈️', 35: '🚢', 12: '⚡', 28: '💧' };

type Mode = 'bots' | 'pass' | 'online';

export default function SalonePolyGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('bots');
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
      {mode === 'online' ? <ConvexRoomProvider><OnlinePoly /></ConvexRoomProvider> : <LocalPoly key={mode} pass={mode === 'pass'} />}
      <Rulebook title="Salone-Poly Rulebook" sections={SALONE_POLY_RULES} />
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Local games                                                          */
/* ------------------------------------------------------------------ */

function LocalPoly({ pass }: { pass: boolean }) {
  const [s, setS] = useState<SalonePolyState | null>(null);
  const [saved, setSaved] = useState<SalonePolyState | null>(null);
  const [count, setCount] = useState(pass ? 3 : 3);
  const [names, setNames] = useState<string[]>(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6']);
  const [bots, setBots] = useState<boolean[]>([false, true, true, true, true, true]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const g = engine.deserialize(raw); if (g.status === 'playing') setSaved(g); } } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!s) return;
    try { if (s.status === 'playing') localStorage.setItem(SAVE_KEY, engine.serialize(s)); else localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }, [s]);

  // Bots decide after a short pause; auction bids go a little quicker.
  const who = s && s.status === 'playing' ? actor(s) : -1;
  const botTurn = who >= 0 && !!s?.players[who].isAI;
  useEffect(() => {
    if (!botTurn || !s) return;
    const t = setTimeout(() => setS((g) => {
      if (!g || g.status !== 'playing') return g;
      const p = g.players[actor(g)];
      return p.isAI ? engine.applyMove(g, engine.getAIMove(g, p.difficulty ?? 'medium')) : g;
    }), s.phase === 'auction' ? 450 : 750);
    return () => clearTimeout(t);
  }, [botTurn, s]);

  // Timed games end when the clock runs out.
  useEffect(() => {
    if (!s?.endsAt || s.status !== 'playing') return;
    const t = setTimeout(() => setS((g) => (g && g.status === 'playing' ? engine.applyMove(g, { type: 'time_up' }) : g)), Math.max(0, s.endsAt - Date.now()));
    return () => clearTimeout(t);
  }, [s?.endsAt, s?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    sfx('shuffle');
    const players = Array.from({ length: count }, (_, i) => {
      const ai = pass ? bots[i] : i > 0;
      return createPlayer(`p${i}`, pass ? names[i].trim() || `Player ${i + 1}` : i === 0 ? 'You' : `Bot ${i}`, ai, ai ? difficulty : undefined);
    });
    setS(engine.initialize(players, { minutes }));
  };

  if (!s) {
    return (
      <div className="space-y-4">
        <BoardPreview />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">Players
            <select className="field" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">Bot level
            <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">Time limit
            <select className="field" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={0}>None</option><option value={20}>20 min</option><option value={40}>40 min</option><option value={60}>60 min</option>
            </select>
          </label>
        </div>
        {pass && (
          <ul className="space-y-2">
            {Array.from({ length: count }, (_, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="h-7 w-7 shrink-0 rounded-full border-2 border-white shadow" style={{ background: PAWNS[i] }} />
                <input className="field min-w-0 flex-1" maxLength={20} value={names[i]} aria-label={`Player ${i + 1} name`}
                  onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                <select className="field" value={bots[i] ? 'ai' : 'human'} aria-label={`Player ${i + 1} type`}
                  onChange={(e) => setBots((b) => b.map((x, j) => (j === i ? e.target.value === 'ai' : x)))}>
                  <option value="human">Person</option><option value="ai">Bot</option>
                </select>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary btn-lg w-full" onClick={start} disabled={pass && bots.slice(0, count).every(Boolean)}>
          <Icon name="play" size={20} />Start Salone-Poly
        </button>
        {saved && <button className="btn btn-outline w-full" onClick={() => { setS(saved); setSaved(null); }}>Resume saved game</button>}
      </div>
    );
  }

  const humans = s.players.map((p, i) => (p.isAI ? -1 : i)).filter((i) => i >= 0);
  // vs bots: you. Pass & play: whoever must decide now (if they are a person).
  const me = humans.length === 1 ? humans[0] : who >= 0 && !s.players[who].isAI ? who : -1;

  const trade = async (m: TradeMove): Promise<TradeResult> => {
    const partner = s.players[m.with];
    const yes = partner.isAI ? engine.botAcceptsTrade(s, m) : window.confirm(`${partner.name}, do you accept this trade from ${s.players[actor(s)].name}?\n\n${describeTrade(m.give, m.get)}`);
    if (!yes) return 'declined';
    setS((g) => (g ? engine.applyMove(g, m) : g));
    return 'accepted';
  };

  return (
    <div className="space-y-3">
      <PolyTable s={s} me={me} onMove={(m) => setS((g) => (g ? engine.applyMove(g, m) : g))} onTrade={trade} />
      <div className="flex gap-2">
        <button className="btn btn-outline flex-1" onClick={start}>Restart</button>
        <button className="btn btn-outline flex-1" onClick={() => setS(null)}>New setup</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Online games: the server rolls, deals the cards and runs the bots     */
/* ------------------------------------------------------------------ */

function OnlinePoly() {
  const room = useRoom('salone-poly');
  const v = room.view;
  const s = (v?.state ?? null) as SalonePolyState | null;
  if (room.code && v === undefined) return <p className="py-8 text-center text-muted"><span className="loading-dots">Connecting</span></p>;
  const playing = room.joined && s?.status === 'playing';
  const me = v?.me?.seat ?? -1;
  const offer = v?.offer ?? null;

  const trade = async (m: TradeMove): Promise<TradeResult> => {
    const r = await room.offerTrade({ with: m.with, give: m.give, get: m.get });
    if (!r) return 'error';
    return r.accepted === null ? 'pending' : r.accepted ? 'accepted' : 'declined';
  };

  return (
    <div className="space-y-4">
      {room.joined && s && (
        <PolyTable s={s} me={me} busy={room.busy} onMove={(m) => { room.move(m as Parameters<typeof room.move>[0]); }} onTrade={trade}
          banner={offer && s.status === 'playing' && (offer.to === me ? (
            <div className="flash space-y-2 rounded-2xl border border-accent/50 bg-accent/10 p-3">
              <p className="font-semibold">🤝 {s.players[offer.from].name} offers you a trade</p>
              <p className="whitespace-pre-line text-sm">{describeTrade(offer.give, offer.get, s.players[offer.from].name, 'you')}</p>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm flex-1" onClick={() => room.respondTrade(true)}>Accept</button>
                <button className="btn btn-outline btn-sm flex-1" onClick={() => room.respondTrade(false)}>Decline</button>
              </div>
            </div>
          ) : offer.from === me ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-bg/60 p-3 text-sm">
              <span className="loading-dots">Waiting for {s.players[offer.to].name} to answer your trade</span>
              <button className="btn btn-ghost btn-sm" onClick={() => room.respondTrade(false)}>Withdraw</button>
            </div>
          ) : null)}
        />
      )}
      {room.error && playing && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>}
      {!playing && <RoomLobby room={room} title="Salone-Poly" maxSeats={6} timer />}
      {playing && <button className="btn btn-ghost w-full text-danger" onClick={() => { if (confirm('Leave this game? A bot will take your seat.')) room.leave(); }}><Icon name="logout" size={18} />Leave game</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The table                                                            */
/* ------------------------------------------------------------------ */

function PolyTable({ s, me, onMove, onTrade, busy = false, banner }: {
  s: SalonePolyState; me: number; onMove: (m: SalonePolyMove) => void; onTrade: (m: TradeMove) => Promise<TradeResult>; busy?: boolean; banner?: ReactNode;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [trading, setTrading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const over = s.status === 'finished';
  const who = over ? -1 : actor(s);
  const mine = me >= 0 && who === me && !busy;
  const can = (m: SalonePolyMove) => me >= 0 && !busy && engine.check(s, m, me) === null;
  const shown = useWalk(s.positions);
  const rolls = useTableEvents(s);
  useEndSfx(over, me >= 0 && s.winner !== me);

  const pending = s.pendingBuy !== null ? SALONE_POLY_BOARD[s.pendingBuy] : null;
  const debt = s.phase === 'debt' && s.debts.length ? s.debts[0] : null;
  const name = (i: number) => (i === me ? 'You' : s.players[i].name);
  const status = over
    ? s.winner !== null ? `🏆 ${s.players[s.winner].name} wins Salone-Poly!` : 'Game over: a tie on net worth.'
    : s.phase === 'auction' && s.auction ? `Auction for ${SALONE_POLY_BOARD[s.auction.space].name}: ${s.auction.highBidder !== null ? `${leones(s.auction.highBid)} by ${name(s.auction.highBidder)}` : 'no bids yet'}`
      : s.phase === 'debt' && debt ? `${name(debt.debtor)} ${debt.debtor === me ? 'owe' : 'owes'} ${leones(debt.amount)} ${debt.creditor !== null ? `to ${name(debt.creditor)}` : 'to the bank'}`
        : s.phase === 'buy' && pending ? `${name(s.currentPlayerIndex)} landed on ${pending.name}`
          : s.players[who]?.isAI ? `${s.players[who].name} is thinking…`
            : mine ? s.phase === 'end' ? 'Build, trade, or end your turn.' : s.phase === 'jail' ? 'You are in jail.' : 'Your turn: roll the dice!'
              : `Waiting for ${name(who)}…`;

  return (
    <div className="space-y-3">
      {banner}
      <Board s={s} shown={shown} onTap={setSelected} selected={selected}>
        <div className="flex flex-col items-center gap-1 text-center sm:gap-2">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            {[0, 1].map((k) => (
              <div key={`${rolls}-${k}`} className={rolls > 0 ? 'sl-die-drop' : ''}>
                <Die3D value={s.dice[k] || 6} size={30} still={rolls === 0} delayMs={k * 90} />
              </div>
            ))}
          </div>
          {s.lastCard && (
            <div key={`${s.lastCard.text}-${rolls}`} className={`poly-card ${s.lastCard.deck === 'luck' ? 'is-luck' : 'is-osusu'}`}>
              <span className="font-display font-bold">{s.lastCard.deck === 'luck' ? '❓ Luck' : '🪙 Osusu'}</span>
              <span>{s.lastCard.text}</span>
            </div>
          )}
        </div>
      </Board>

      <p className="text-center font-semibold" aria-live="polite">{status}</p>
      {s.endsAt && !over && <Countdown endsAt={s.endsAt} />}

      {/* decisions */}
      {mine && !over && (
        <div className="flash flex flex-wrap justify-center gap-2">
          {(s.phase === 'roll' || s.phase === 'jail') && can({ type: 'roll' }) && (
            <button className="btn btn-primary btn-lg" onClick={() => onMove({ type: 'roll' })}>🎲 {s.phase === 'jail' ? 'Roll for a double' : 'Roll the dice'}</button>
          )}
          {s.phase === 'jail' && can({ type: 'pay_jail' }) && <button className="btn btn-outline" onClick={() => onMove({ type: 'pay_jail' })}>Pay {leones(SALONE_POLY.jailFine)} fine</button>}
          {s.phase === 'jail' && can({ type: 'use_jail_card' }) && <button className="btn btn-outline" onClick={() => onMove({ type: 'use_jail_card' })}>Use bail card</button>}
          {s.phase === 'buy' && pending && (
            <>
              <button className="btn btn-primary" disabled={!can({ type: 'buy' })} onClick={() => onMove({ type: 'buy' })}>Buy for {leones(pending.price!)}</button>
              <button className="btn btn-outline" onClick={() => onMove({ type: 'decline' })}>Auction it</button>
              {!can({ type: 'buy' }) && <p className="w-full text-center text-sm text-muted">Not enough cash. Mortgage something, or let it go to auction.</p>}
            </>
          )}
          {s.phase === 'auction' && s.auction && <AuctionBids s={s} me={me} onMove={onMove} />}
          {debt && (
            <>
              {can({ type: 'pay_debt' }) ? <button className="btn btn-primary" onClick={() => onMove({ type: 'pay_debt' })}>Pay {leones(debt.amount)}</button>
                : <p className="w-full text-center text-sm text-muted">Raise {leones(debt.amount - s.money[me])} more: tap your properties to sell houses or mortgage.</p>}
              {can({ type: 'bankrupt' }) && <button className="btn btn-ghost text-danger" onClick={() => window.confirm('Declare bankruptcy? Everything you own goes to whoever you owe.') && onMove({ type: 'bankrupt' })}>Declare bankruptcy</button>}
            </>
          )}
          {s.phase === 'end' && <button className="btn btn-primary btn-lg" onClick={() => onMove({ type: 'end_turn' })}>End turn</button>}
          {(s.phase === 'end' || s.phase === 'roll' || s.phase === 'jail' || s.phase === 'debt') && s.players.some((_, i) => i !== me && !s.bankrupt[i]) && (
            <button className="btn btn-outline" onClick={() => setTrading(true)}>🤝 Trade</button>
          )}
        </div>
      )}
      {note && <p className="flash text-center text-sm font-semibold text-secondary">{note}</p>}

      <Players s={s} me={me} who={who} />

      {over && (
        <div className="flash space-y-2 rounded-3xl border border-accent/40 bg-accent/10 p-5 text-center">
          <p className="text-4xl" aria-hidden>{me >= 0 && s.winner === me ? '🏆' : '🏝️'}</p>
          <h2>{s.winner !== null ? (s.winner === me ? 'You win!' : `${s.players[s.winner].name} wins!`) : 'Game over'}</h2>
          <ul className="text-sm">
            {s.players.map((p, i) => <li key={p.id}>{p.name}: {leones(s.netWorths?.[i] ?? netWorth(s, i))}{s.bankrupt[i] ? ' (bankrupt)' : ''}</li>)}
          </ul>
        </div>
      )}

      <details className="rounded-2xl border border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Game log</summary>
        <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {s.log.slice(-40).reverse().map((l, i) => <li key={s.log.length - i} className={i === 0 ? 'font-semibold' : 'text-muted'}>{l}</li>)}
        </ol>
      </details>

      {selected !== null && <SpaceSheet s={s} space={selected} me={me} can={can} onMove={onMove} onClose={() => setSelected(null)} />}
      {trading && me >= 0 && (
        <TradeSheet s={s} me={me} onClose={() => setTrading(false)} onPropose={async (m) => {
          const r = await onTrade(m);
          setNote(r === 'accepted' ? '🤝 Trade done!' : r === 'declined' ? `${s.players[m.with].name} said no.` : r === 'pending' ? `Offer sent to ${s.players[m.with].name}.` : null);
          if (r === 'accepted') sfx('success'); else if (r === 'declined') sfx('error');
          setTimeout(() => setNote(null), 3500);
          setTrading(false);
        }} />
      )}
    </div>
  );
}

/* ---------- board ---------- */

function Board({ s, shown, onTap, selected, children }: { s: SalonePolyState; shown: number[]; onTap: (i: number) => void; selected: number | null; children: ReactNode }) {
  const tokens = s.players.map((_, i) => i).filter((i) => !s.bankrupt[i]);
  return (
    <div className="poly-board">
      {SALONE_POLY_BOARD.map((sp) => <Tile key={sp.id} sp={sp} s={s} onTap={onTap} selected={selected === sp.id} />)}
      <div className="poly-centre">{children}</div>
      {tokens.map((i) => {
        const [r, c] = CELL[shown[i] ?? 0];
        const same = tokens.filter((j) => shown[j] === shown[i]);
        const k = same.indexOf(i);
        const spread = same.length > 1 ? (k - (same.length - 1) / 2) * 2.2 : 0;
        return (
          <span key={i} className={`poly-pawn ${i === actorSafe(s) ? 'is-active' : ''}`} title={s.players[i].name}
            style={{ left: `calc(${centre(c)}% + ${spread}%)`, top: `calc(${centre(r)}% + ${(k % 2) * 1.6}%)`, background: PAWNS[i % PAWNS.length] }} />
        );
      })}
    </div>
  );
}
const actorSafe = (s: SalonePolyState) => (s.status === 'playing' ? actor(s) : -1);

function Tile({ sp, s, onTap, selected }: { sp: BoardSpace; s: SalonePolyState; onTap: (i: number) => void; selected: boolean }) {
  const [r, c] = CELL[sp.id];
  const owner = s.owners[sp.id];
  const group = sp.group ? SALONE_POLY_GROUPS[sp.group].color : null;
  const corner = sp.id % 10 === 0;
  const b = s.buildings[sp.id];
  return (
    <button type="button" onClick={() => onTap(sp.id)} aria-label={sp.name}
      className={`poly-tile side-${SIDE(sp.id)} ${corner ? 'is-corner' : ''} ${selected ? 'is-selected' : ''}`}
      style={{ gridRow: r + 1, gridColumn: c + 1, ...(owner !== null ? { ['--owner' as string]: PAWNS[owner % PAWNS.length] } : {}) }}>
      {group && <span className="poly-strip" style={{ background: group }}>
        {b > 0 && <span className="poly-houses">{b === 5 ? <i className="is-hotel" /> : Array.from({ length: b }, (_, k) => <i key={k} />)}</span>}
      </span>}
      {corner ? <CornerArt id={sp.id} /> : (
        <>
          {ICON[sp.id] && <span className="poly-icon" aria-hidden>{ICON[sp.id]}</span>}
          <span className="poly-name">{sp.name}</span>
          {sp.price !== undefined && <span className="poly-price">{leones(sp.price)}</span>}
          {sp.tax !== undefined && <span className="poly-price">Pay {leones(sp.tax)}</span>}
        </>
      )}
      {owner !== null && <span className="poly-owner" aria-label={`Owned by ${s.players[owner].name}`} />}
      {s.mortgaged[sp.id] && <span className="poly-mortgaged" aria-label="Mortgaged">M</span>}
    </button>
  );
}

function CornerArt({ id }: { id: number }) {
  if (id === 0) return <span className="poly-corner"><b className="text-primary">START</b><span className="poly-name">Collect {leones(SALONE_POLY.goSalary)}</span><span className="text-xl text-primary" aria-hidden>➜</span></span>;
  if (id === 10) return <span className="poly-corner"><span className="text-xl" aria-hidden>🔒</span><b>JAIL</b><span className="poly-name">Just visiting</span></span>;
  if (id === 20) return <span className="poly-corner"><span className="text-xl" aria-hidden>☕</span><b>ATTAYA</b><span className="poly-name">Free rest stop</span></span>;
  return <span className="poly-corner"><span className="text-xl" aria-hidden>🚓</span><b>GO TO JAIL</b></span>;
}

function Logo() {
  return (
    <div className="poly-logo">
      <span className="poly-logo-flag" aria-hidden />
      <span>SALONE-POLY</span>
    </div>
  );
}

function BoardPreview() {
  const preview = useMemo(() => engine.initialize([createPlayer('a', 'A'), createPlayer('b', 'B'), createPlayer('c', 'C')]), []);
  return (
    <Board s={preview} shown={preview.positions} onTap={() => {}} selected={null}>
      <div className="flex flex-col items-center gap-2 text-center"><Logo /><p className="max-w-[16rem] text-xs text-muted sm:text-sm">Buy Sierra Leone&apos;s landmarks, build houses and hotels, and collect rent from your rivals.</p></div>
    </Board>
  );
}

/* ---------- players ---------- */

function Players({ s, me, who }: { s: SalonePolyState; me: number; who: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {s.players.map((p, i) => {
        const owned = s.owners.map((o, k) => (o === i ? k : -1)).filter((k) => k >= 0);
        return (
          <div key={p.id} className={`rounded-2xl border p-2.5 transition-all ${i === who ? 'border-primary bg-primary/10 uno-turn' : 'border-border bg-surface/70'} ${s.bankrupt[i] ? 'opacity-45' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white shadow" style={{ background: PAWNS[i % PAWNS.length] }} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i === me && p.name !== 'You' ? `${p.name} (you)` : p.name}</span>
              {p.isAI && <Icon name="gamepad" size={14} className="text-muted" />}
            </div>
            <Money value={s.money[i]} />
            <div className="mt-1 flex flex-wrap gap-0.5">
              {owned.map((k) => {
                const sp = SALONE_POLY_BOARD[k];
                return <span key={k} title={sp.name} className={`h-2 w-3 rounded-sm ${s.mortgaged[k] ? 'opacity-30' : ''}`} style={{ background: sp.group ? SALONE_POLY_GROUPS[sp.group].color : '#64748b' }} />;
              })}
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
              {s.inJail[i] && <span className="chip chip-accent">🔒 Jail</span>}
              {s.jailCards[i].luck + s.jailCards[i].osusu > 0 && <span className="chip chip-secondary">Bail ×{s.jailCards[i].luck + s.jailCards[i].osusu}</span>}
              {s.bankrupt[i] && <span className="chip chip-muted">Bankrupt</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Cash that ticks up or down when it changes */
function Money({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setDir(value > start ? 1 : -1);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step); else { from.current = value; setTimeout(() => setDir(0), 400); }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <p className={`font-display text-lg font-bold tabular-nums transition-colors ${dir > 0 ? 'text-primary' : dir < 0 ? 'text-danger' : ''}`}>{leones(shown)}</p>;
}

/* ---------- auction, property, trade ---------- */

function AuctionBids({ s, me, onMove }: { s: SalonePolyState; me: number; onMove: (m: SalonePolyMove) => void }) {
  const [custom, setCustom] = useState('');
  const a = s.auction!;
  const min = Math.max(SALONE_POLY.openingBid, a.highBid + 1);
  const options = [min, a.highBid + 10, a.highBid + 50, a.highBid + 100].filter((x, i, arr) => x >= min && x <= s.money[me] && arr.indexOf(x) === i);
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap justify-center gap-2">
        {options.map((x) => <button key={x} className="btn btn-primary btn-sm" onClick={() => onMove({ type: 'bid', amount: x })}>Bid {leones(x)}</button>)}
        <button className="btn btn-outline btn-sm" onClick={() => onMove({ type: 'auction_pass' })}>Pass</button>
      </div>
      <form className="flex justify-center gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(custom); if (n >= min) onMove({ type: 'bid', amount: n }); setCustom(''); }}>
        <input className="field w-28 text-center" inputMode="numeric" value={custom} placeholder={`${min}+`} aria-label="Your bid" onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} />
        <button className="btn btn-outline btn-sm" disabled={Number(custom) < min || Number(custom) > s.money[me]}>Bid</button>
      </form>
    </div>
  );
}

function SpaceSheet({ s, space, me, can, onMove, onClose }: {
  s: SalonePolyState; space: number; me: number; can: (m: SalonePolyMove) => boolean; onMove: (m: SalonePolyMove) => void; onClose: () => void;
}) {
  const sp = SALONE_POLY_BOARD[space];
  const owner = s.owners[space];
  const color = sp.group ? SALONE_POLY_GROUPS[sp.group].color : '#475569';
  const options: { label: string; m: SalonePolyMove }[] = [
    { label: `Build ${s.buildings[space] === 4 ? 'a hotel' : 'a house'} (${leones(sp.houseCost ?? 0)})`, m: { type: 'build', space } },
    { label: `Sell a building (+${leones(Math.floor((sp.houseCost ?? 0) / 2))})`, m: { type: 'sell_building', space } },
    { label: `Mortgage (+${leones(sp.mortgage ?? 0)})`, m: { type: 'mortgage', space } },
    { label: `Pay off mortgage (${leones(sp.mortgage ? unmortgageCost(space) : 0)})`, m: { type: 'unmortgage', space } },
  ];
  const acts = options.filter((a) => me >= 0 && sp.price !== undefined && can(a.m));
  return (
    <Portal><div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={sp.name}>
      <div className="pop-in w-full max-w-sm overflow-hidden rounded-3xl bg-surface shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 text-white" style={{ background: color }}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-85">{sp.group ? SALONE_POLY_GROUPS[sp.group].label : sp.type.replace(/_/g, ' ')}</p>
          <p className="font-display text-2xl font-bold">{ICON[space] ? `${ICON[space]} ` : ''}{sp.name}</p>
        </div>
        <div className="space-y-2 p-4 text-sm">
          {sp.rent && (
            <table className="w-full">
              <tbody>
                {['Rent', 'With 1 house', 'With 2 houses', 'With 3 houses', 'With 4 houses', 'With a hotel'].map((label, k) => (
                  <tr key={label} className={s.buildings[space] === k && owner !== null ? 'font-bold text-primary' : ''}><td>{label}</td><td className="text-right tabular-nums">{leones(sp.rent![k])}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {sp.rent && <p className="text-muted">Own the whole group: base rent doubles. Houses cost {leones(sp.houseCost!)} each.</p>}
          {sp.type === 'transport' && <p>Rent: {SALONE_POLY.transportRent.slice(1).map(leones).join(' / ')} for owning 1, 2, 3 or 4 transport hubs.</p>}
          {sp.type === 'utility' && <p>Rent: dice total × {SALONE_POLY.utilityMultiplier[1]}, or × {SALONE_POLY.utilityMultiplier[2]} with both utilities.</p>}
          {sp.price !== undefined && <p>Price {leones(sp.price)} · Mortgage value {leones(sp.mortgage ?? 0)}</p>}
          {sp.price !== undefined && <p className="font-semibold">{owner === null ? 'Not owned yet' : `Owned by ${owner === me ? 'you' : s.players[owner].name}${s.mortgaged[space] ? ' (mortgaged)' : ''}`}</p>}
          {sp.price === undefined && <p className="text-muted">{spaceHelp(sp)}</p>}
          {acts.length > 0 && <div className="grid gap-2 pt-1">{acts.map((a) => <button key={a.label} className="btn btn-outline btn-sm" onClick={() => onMove(a.m)}>{a.label}</button>)}</div>}
          <button className="btn btn-ghost w-full" onClick={onClose}>Close</button>
        </div>
      </div>
    </div></Portal>
  );
}

function spaceHelp(sp: BoardSpace) {
  switch (sp.type) {
    case 'go': return `Collect ${leones(SALONE_POLY.goSalary)} every time you pass or land here.`;
    case 'jail': return 'Landing here by a normal move means you are just visiting.';
    case 'free_parking': return 'Take a break for attaya. Nothing happens here.';
    case 'go_to_jail': return 'Go straight to jail without passing Start.';
    case 'luck': return 'Take a Luck card: travel, rewards and surprises.';
    case 'osusu': return 'Take an Osusu card: savings, fees, gifts and birthdays.';
    case 'tax': return `Pay ${leones(sp.tax ?? 0)} to the bank.`;
    default: return '';
  }
}

function TradeSheet({ s, me, onClose, onPropose }: { s: SalonePolyState; me: number; onClose: () => void; onPropose: (m: TradeMove) => void }) {
  const partners = s.players.map((_, i) => i).filter((i) => i !== me && !s.bankrupt[i]);
  const [withP, setWith] = useState(partners[0]);
  const [give, setGive] = useState<TradeSide>(EMPTY);
  const [get, setGet] = useState<TradeSide>(EMPTY);
  const move: TradeMove = { type: 'trade', with: withP, give, get };
  const why = engine.check(s, move, me);
  const tradeable = (p: number) => SALONE_POLY_BOARD.filter((sp) => s.owners[sp.id] === p
    && !(sp.group && SALONE_POLY_GROUPS[sp.group].spaces.some((j) => s.buildings[j] > 0)));
  const side = (p: number, value: TradeSide, set: (t: TradeSide) => void, label: string) => (
    <div className="min-w-0 flex-1 space-y-2">
      <p className="font-semibold">{label}</p>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
        {tradeable(p).length === 0 && <p className="text-xs text-muted">No property to trade.</p>}
        {tradeable(p).map((sp) => (
          <label key={sp.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.spaces.includes(sp.id)}
              onChange={() => set({ ...value, spaces: value.spaces.includes(sp.id) ? value.spaces.filter((x) => x !== sp.id) : [...value.spaces, sp.id] })} />
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: sp.group ? SALONE_POLY_GROUPS[sp.group].color : '#64748b' }} />
            <span className="truncate">{sp.name}{s.mortgaged[sp.id] ? ' (M)' : ''}</span>
          </label>
        ))}
      </div>
      <input className="field w-full" inputMode="numeric" placeholder="Cash (Le)" value={value.cash || ''} aria-label={`${label}: cash`}
        onChange={(e) => set({ ...value, cash: Math.min(s.money[p], Number(e.target.value.replace(/\D/g, '')) || 0) })} />
      {s.jailCards[p].luck + s.jailCards[p].osusu > 0 && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.jailCards > 0} onChange={(e) => set({ ...value, jailCards: e.target.checked ? 1 : 0 })} />A bail card</label>
      )}
    </div>
  );
  return (
    <Portal><div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Trade">
      <div className="pop-in max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-3xl bg-surface p-4 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-xl font-bold">🤝 Trade</p>
          <select className="field" value={withP} aria-label="Trade with" onChange={(e) => { setWith(Number(e.target.value)); setGet(EMPTY); }}>
            {partners.map((i) => <option key={i} value={i}>with {s.players[i].name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {side(me, give, setGive, 'You give')}
          {side(withP, get, setGet, `${s.players[withP].name} gives`)}
        </div>
        {why && (give.spaces.length || get.spaces.length || give.cash || get.cash) ? <p className="text-sm text-danger">{why}</p> : null}
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" disabled={!!why} onClick={() => onPropose(move)}>Offer trade</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
        {s.players[withP].isAI && <p className="hint">Bots only say yes to trades that are good for them.</p>}
      </div>
    </div></Portal>
  );
}

function describeTrade(give: TradeSide, get: TradeSide, from = 'You', to = 'them') {
  const list = (t: TradeSide) => [...t.spaces.map((i) => SALONE_POLY_BOARD[i].name), ...(t.cash ? [leones(t.cash)] : []), ...(t.jailCards ? ['a bail card'] : [])].join(', ') || 'nothing';
  return `${from} give${from === 'You' ? '' : 's'}: ${list(give)}\n${to === 'you' ? 'You give' : `${to} gives`}: ${list(get)}`;
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()));
  useEffect(() => { const t = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 1000); return () => clearInterval(t); }, [endsAt]);
  const sec = Math.ceil(left / 1000);
  return <p className={`text-center text-sm font-bold tabular-nums ${sec < 60 ? 'text-danger' : 'text-muted'}`}>⏰ {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')} left</p>;
}

/* ---------- motion and sound ---------- */

/** Pawns walk one square at a time to their new spot (and jump straight to jail). */
function useWalk(positions: number[]) {
  const [shown, setShown] = useState(positions);
  const target = useRef(positions);
  target.current = positions;
  useEffect(() => {
    const t = setInterval(() => {
      setShown((cur) => {
        let moved = false;
        const next = target.current.map((to, i) => {
          const from = cur[i] ?? to;
          if (from === to) return from;
          const ahead = (to - from + 40) % 40;
          moved = true;
          return ahead > 0 && ahead <= 12 ? (from + 1) % 40 : to; // long or backward moves jump
        });
        return moved ? next : cur;
      });
    }, 150);
    return () => clearInterval(t);
  }, []);
  return shown.length === positions.length ? shown : positions;
}

/** Sounds for what just happened, worked out from the new log lines. Returns a roll counter for the dice animation. */
function useTableEvents(s: SalonePolyState) {
  const prev = useRef(s);
  const [rolls, setRolls] = useState(0);
  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    if (p === s) return;
    const at = s.log.lastIndexOf(p.log[p.log.length - 1]);
    const fresh = at >= 0 ? s.log.slice(at + 1) : s.log.slice(-3);
    if (fresh.some((l) => / rolled /.test(l))) { setRolls((r) => r + 1); sfx('dice'); }
    if (s.owners.filter((o) => o !== null).length > p.owners.filter((o) => o !== null).length) setTimeout(() => sfx('coin'), 900);
    if (fresh.some((l) => /^(❓ Luck|🪙 Osusu|💰 Osusu)/.test(l))) setTimeout(() => sfx('card'), 900);
    if (s.buildings.reduce((x, y) => x + y, 0) > p.buildings.reduce((x, y) => x + y, 0)) sfx('success');
  }, [s]);
  return rolls;
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={onBack} className="back-link">← Back to Salone-Poly</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <h1>🏝️ Salone-Poly</h1>
        {children}
      </div>
    </main>
  );
}
