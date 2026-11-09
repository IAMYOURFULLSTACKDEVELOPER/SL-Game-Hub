'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MonopolyEngine, SIERRAPOLY_BOARD, SIERRAPOLY_GROUPS, MONOPOLY_MANIFEST, SIERRAPOLY,
  SIERRAPOLY_RULES, toBanknotes, unmortgageCost, actor,
  type MonopolyState, type MonopolyMove, type TradeSide, type Difficulty, type ColorGroup,
} from '@slgh/shared';
import { createPlayer } from '@slgh/shared';
import Rulebook from './Rulebook';
import Die3D from './Die3D';

const engine = new MonopolyEngine();
const SAVE_KEY = 'sierrapoly_game_state_v1';
const PLAYER_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];
const nle = (n: number) => `NLE${n.toLocaleString('en-US')}`;

/** [row, col] of each space on the printed board (GO bottom-right, Jail bottom-left) */
const CELL: [number, number][] = (() => {
  const c: [number, number][] = new Array(40);
  for (let i = 0; i <= 10; i++) c[i] = [10, 10 - i];          // bottom row, right → left
  for (let i = 11; i <= 20; i++) c[i] = [20 - i, 0];         // left column, bottom → top
  for (let i = 21; i <= 30; i++) c[i] = [0, i - 20];         // top row, left → right
  for (let i = 31; i <= 39; i++) c[i] = [i - 30, 10];        // right column, top → bottom
  return c;
})();

/** where the colour strip sits: edge of the tile facing the board centre */
const STRIP: Record<number, 'top' | 'bottom' | 'left' | 'right'> = (() => {
  const s: Record<number, 'top' | 'bottom' | 'left' | 'right'> = {};
  for (let i = 0; i <= 10; i++) s[i] = 'top';
  for (let i = 11; i <= 20; i++) s[i] = 'right';
  for (let i = 21; i <= 30; i++) s[i] = 'bottom';
  for (let i = 31; i <= 39; i++) s[i] = 'left';
  return s;
})();

interface Setup { players: number; difficulty: Difficulty; minutes: number; spectate: boolean }

export default function MonopolyGame({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<MonopolyState | null>(null);
  const [setup, setSetup] = useState<Setup>({ players: 3, difficulty: 'medium', minutes: 0, spectate: false });
  const [bid, setBid] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [tradeWith, setTradeWith] = useState<number | null>(null);
  const [give, setGive] = useState<TradeSide>({ spaces: [], cash: 0, jailCards: 0 });
  const [get, setGet] = useState<TradeSide>({ spaces: [], cash: 0, jailCards: 0 });
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [saved, setSaved] = useState<MonopolyState | null>(null);
  const [rollSeq, setRollSeq] = useState(0);
  const timerRef = useRef<number | null>(null);
  const prevDice = useRef('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = engine.deserialize(raw);
        if (s.status === 'playing') setSaved(s);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    if (!state) return;
    if (state.status === 'playing') localStorage.setItem(SAVE_KEY, engine.serialize(state));
    else localStorage.removeItem(SAVE_KEY);
  }, [state]);

  // countdown for timed games
  useEffect(() => {
    if (!state?.endsAt) { setSecondsLeft(null); return; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((state.endsAt! - Date.now()) / 1000)));
    tick();
    timerRef.current = window.setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state?.endsAt]);

  useEffect(() => {
    if (secondsLeft === 0 && state?.status === 'playing') move({ type: 'time_up' });
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-mount the 3D dice every time a new roll lands
  useEffect(() => {
    const d = state?.dice?.join(',') ?? '';
    if (d && d !== '0,0' && d !== prevDice.current) { prevDice.current = d; setRollSeq((r) => r + 1); }
  }, [state]);

  const start = (s?: MonopolyState) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (s) { setState(s); setSelected(null); return; }
    const players = Array.from({ length: setup.players }, (_, i) =>
      setup.spectate || i > 0
        ? createPlayer(`p${i}`, setup.spectate ? `Bot ${i + 1}` : i === 0 ? 'You' : `Bot ${i + 1}`, true, setup.difficulty)
        : createPlayer('you', 'You'));
    setState(engine.initialize(players, { minutes: setup.minutes }));
    setSelected(null); setTradeWith(null);
  };

  const move = (m: MonopolyMove) => {
    setState((prev) => (prev ? engine.applyMove(prev, m) : prev));
    setBid('');
  };

  const aiTurn = !!state && state.status === 'playing' && state.players[actor(state)]?.isAI;
  useEffect(() => {
    if (!aiTurn || !state) return;
    const who = actor(state);
    const t = setTimeout(() => {
      setState((prev) => (prev && prev.status === 'playing' ? engine.applyMove(prev, engine.getAIMove(prev, prev.players[actor(prev)].difficulty ?? 'medium')) : prev));
      setBid('');
    }, who === state.currentPlayerIndex ? 700 : 450);
    return () => clearTimeout(t);
  }, [aiTurn, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const legalMoves = useMemo(() => (state && state.status === 'playing' ? engine.getLegalMoves(state) : []), [state]);

  if (!state) {
    return (
      <Shell onBack={onBack}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/games/boards/sierrapoly.png" alt="SIERRAPOLY board" className="w-full rounded-xl" />
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <label>Players:
            <select value={setup.players} onChange={(e) => setSetup({ ...setup, players: Number(e.target.value) })} className="ml-2 rounded border px-2 py-1">
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Bot level:
            <select value={setup.difficulty} onChange={(e) => setSetup({ ...setup, difficulty: e.target.value as Difficulty })} className="ml-2 rounded border px-2 py-1">
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </label>
          <label>Time limit:
            <select value={setup.minutes} onChange={(e) => setSetup({ ...setup, minutes: Number(e.target.value) })} className="ml-2 rounded border px-2 py-1">
              <option value={0}>No limit</option><option value={20}>20 min</option><option value={40}>40 min</option><option value={60}>60 min</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={setup.spectate} onChange={(e) => setSetup({ ...setup, spectate: e.target.checked })} />
            AI vs AI (watch)
          </label>
        </div>
        <button onClick={() => start()} className="btn btn-primary w-full">🏠 Start SIERRAPOLY</button>
        {saved && <button onClick={() => start(saved)} className="btn btn-outline w-full">Resume saved game</button>}
        <Rulebook title="SierraPoly Rulebook" sections={SIERRAPOLY_RULES} open />
      </Shell>
    );
  }

  const over = state.status === 'finished';
  const turnIdx = actor(state);
  const isYourTurn = !state.players[turnIdx].isAI;
  const sp = state.phase;
  const pending = state.pendingBuy !== null ? SIERRAPOLY_BOARD[state.pendingBuy] : null;
  const auctionSpace = state.auction ? SIERRAPOLY_BOARD[state.auction.space] : null;
  const debt = state.phase === 'debt' && state.debts.length ? state.debts[0] : null;
  const myIdx = state.players.findIndex((p) => !p.isAI) >= 0 ? state.players.findIndex((p) => !p.isAI) : 0;
  const legalFor = (m: MonopolyMove) => engine.isValidMove(state, m, turnIdx);
  const canManage = isYourTurn && (sp === 'roll' || sp === 'jail' || sp === 'end' || sp === 'debt');

  const status = over
    ? state.winner !== null ? `🏆 ${state.players[state.winner].name} wins!` : 'Game over — tie on net worth.'
    : aiTurn ? `${state.players[turnIdx].name} is thinking…`
      : sp === 'roll' ? `${state.players[state.currentPlayerIndex].name}: roll the dice`
        : sp === 'jail' ? `${state.players[state.currentPlayerIndex].name} is in Jail — roll for doubles, pay ${nle(SIERRAPOLY.jailFine)}, or use a card`
          : sp === 'buy' ? `${state.players[state.currentPlayerIndex].name} landed on ${pending?.name} — buy for ${nle(pending?.price ?? 0)} or auction it`
            : sp === 'auction' ? `Auction: ${auctionSpace?.name} — high bid ${nle(state.auction?.highBid ?? 0)}${state.auction?.highBidder != null ? ` by ${state.players[state.auction.highBidder].name}` : ''}`
              : sp === 'debt' ? `${state.players[debt!.debtor].name} owes ${nle(debt!.amount)}${debt!.creditor !== null ? ` to ${state.players[debt!.creditor].name}` : ' to the Bank'} (${debt!.reason})`
                : `${state.players[state.currentPlayerIndex].name} — end your turn`;

  const toggleSpace = (list: TradeSide, i: number): TradeSide => {
    const has = list.spaces.includes(i);
    return { ...list, spaces: has ? list.spaces.filter((x) => x !== i) : [...list.spaces, i] };
  };

  return (
    <Shell onBack={onBack}>
      {/* printed board with clickable overlay + player tokens */}
      <div className="overflow-x-auto">
        <div className="relative mx-auto min-w-[520px] max-w-[640px] select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/games/boards/sierrapoly.png" alt="SIERRAPOLY board" className="pointer-events-none w-full rounded-lg" draggable={false} />
          {SIERRAPOLY_BOARD.map((s) => {
            const [r, c] = CELL[s.id];
            const owner = state.owners[s.id];
            const groupColor = s.group ? SIERRAPOLY_GROUPS[s.group].color : null;
            const tokens = state.positions.flatMap((pos, pi) => (pos === s.id && !state.bankrupt[pi] ? [pi] : []));
            const cell = 100 / 11;
            const strip = STRIP[s.id];
            return (
              <button key={s.id} onClick={() => setSelected(s.id)} title={s.name} aria-label={s.name}
                className="absolute rounded-sm transition hover:bg-amber-300/25"
                style={{ left: `${c * cell}%`, top: `${r * cell}%`, width: `${cell}%`, height: `${cell}%`, background: owner !== null ? `${PLAYER_COLORS[owner]}30` : undefined }}>
                {groupColor && (
                  <span className="absolute" style={{
                    background: groupColor,
                    ...(strip === 'top' ? { top: 0, left: 0, right: 0, height: '12%' }
                      : strip === 'bottom' ? { bottom: 0, left: 0, right: 0, height: '12%' }
                        : strip === 'left' ? { left: 0, top: 0, bottom: 0, width: '12%' }
                          : { right: 0, top: 0, bottom: 0, width: '12%' }),
                  }} />
                )}
                {state.mortgaged[s.id] && (
                  <span className="absolute inset-0 flex items-center justify-center bg-neutral-800/50 text-[10px] font-black text-white">M</span>
                )}
                {state.buildings[s.id] > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex flex-wrap-reverse gap-px" title={state.buildings[s.id] === 5 ? 'Hotel' : `${state.buildings[s.id]} houses`}>
                    {state.buildings[s.id] === 5
                      ? <span className="inline-block h-2 w-2 rounded-sm bg-red-600 ring-1 ring-white" />
                      : Array.from({ length: state.buildings[s.id] }, (_, i) => <span key={i} className="inline-block h-1.5 w-1.5 rounded-sm bg-green-600 ring-1 ring-white" />)}
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 flex justify-center gap-px pb-0.5">
                  {tokens.map((pi) => (
                    <span key={pi} className="inline-block rounded-full border border-black/60 shadow"
                      style={{ width: '26%', maxWidth: 14, aspectRatio: '1', background: PLAYER_COLORS[pi] }} />
                  ))}
                </span>
                {selected === s.id && <span className="absolute inset-0 rounded-sm border-2 border-amber-500 bg-amber-400/20" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* players + money as banknotes */}
      <div className="grid gap-2 sm:grid-cols-2">
        {state.players.map((p, i) => (
          <div key={p.id} className={`rounded-lg border-2 p-2 text-sm ${i === state.currentPlayerIndex && !over ? 'border-accent' : 'border-border'} ${state.bankrupt[i] ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-black/40" style={{ background: PLAYER_COLORS[i] }} />{p.name}</span>
              <span>{nle(state.money[i])}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {toBanknotes(state.money[i]).slice(0, 8).map(([note, qty]) => (
                <span key={note} className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-900">×{qty} {note >= 100 ? `NLE${note}` : note}</span>
              ))}
              {state.inJail[i] && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold">🔒 Jail</span>}
              {(state.jailCards[i].chance + state.jailCards[i].community_chest) > 0 && <span className="rounded bg-sky-100 px-1 text-[10px] font-bold">Get Out Free ×{state.jailCards[i].chance + state.jailCards[i].community_chest}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 3D rolling dice tray */}
      <div className="dice-tray flex items-center justify-center gap-6 rounded-xl p-3">
        {[0, 1].map((k) => (
          <div key={`${rollSeq}-${k}`} className={state.dice[0] > 0 ? 'sl-die-drop' : ''} style={{ animationDelay: `${k * 90}ms` }}>
            <Die3D value={state.dice[k] || 6} size={56} still={state.dice[0] === 0} delayMs={k * 90} />
          </div>
        ))}
        {state.dice[0] > 0 && (
          <p className="text-sm font-bold text-white">{state.dice[0]} + {state.dice[1]} = {state.dice[0] + state.dice[1]}{state.dice[0] === state.dice[1] ? ' (doubles!)' : ''}</p>
        )}
      </div>
      {state.lastCard && <p className="text-center text-sm">{state.lastCard.deck === 'chance' ? '❓ Chance' : '💰 Community Chest'}: “{state.lastCard.text}”</p>}
      {secondsLeft !== null && <p className="text-center text-sm font-bold">⏰ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left</p>}
      <p className="text-center font-semibold" aria-live="polite">{status}</p>

      {/* phase actions */}
      {!over && isYourTurn && (
        <div className="flex flex-wrap justify-center gap-2">
          {(sp === 'roll' || sp === 'jail') && legalFor({ type: 'roll' }) && (
            <button onClick={() => move({ type: 'roll' })} className="btn btn-primary">🎲 {sp === 'jail' ? 'Roll for doubles' : 'Roll Dice'}</button>
          )}
          {sp === 'jail' && (
            <>
              {legalFor({ type: 'pay_jail' }) && <button onClick={() => move({ type: 'pay_jail' })} className="btn btn-outline">Pay {nle(SIERRAPOLY.jailFine)} fine</button>}
              {legalFor({ type: 'use_jail_card' }) && <button onClick={() => move({ type: 'use_jail_card' })} className="btn btn-outline">Use Get Out of Jail Free</button>}
            </>
          )}
          {sp === 'buy' && pending && (
            <>
              <button onClick={() => move({ type: 'buy' })} className="btn btn-primary">Buy {pending.name} — {nle(pending.price ?? 0)}</button>
              <button onClick={() => move({ type: 'decline' })} className="btn btn-outline">Auction instead</button>
            </>
          )}
          {sp === 'auction' && state.auction && (
            <>
              <input value={bid} onChange={(e) => setBid(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={`Min ${Math.max(SIERRAPOLY.openingBid, state.auction.highBid + 1)}`}
                className="w-28 rounded border px-2 py-1 text-center" />
              <button onClick={() => { const a = Number(bid); if (a > 0) move({ type: 'bid', amount: a }); }} className="btn btn-primary">Bid</button>
              <button onClick={() => move({ type: 'auction_pass' })} className="btn btn-outline">Pass</button>
            </>
          )}
          {debt && (
            <>
              {legalFor({ type: 'pay_debt' }) && <button onClick={() => move({ type: 'pay_debt' })} className="btn btn-primary">Pay {nle(debt.amount)}</button>}
              {legalFor({ type: 'bankrupt' }) && <button onClick={() => window.confirm('Declare bankruptcy? Your assets go to creditors / the Bank.') && move({ type: 'bankrupt' })} className="btn btn-danger">Declare bankruptcy</button>}
            </>
          )}
          {sp === 'end' && <button onClick={() => move({ type: 'end_turn' })} className="btn btn-primary">End Turn</button>}
        </div>
      )}

      {/* selected property panel */}
      {selected !== null && !over && (() => {
        const s = SIERRAPOLY_BOARD[selected];
        const owner = state.owners[selected];
        const acts: { label: string; m: MonopolyMove; danger?: boolean }[] = [];
        if (canManage) {
          for (const m of legalMoves) {
            if ('space' in m && m.space === selected) {
              if (m.type === 'build') acts.push({ label: `Build ${state.buildings[selected] === 4 ? 'hotel' : 'house'} (${nle(s.houseCost ?? 0)})`, m });
              if (m.type === 'sell_building') acts.push({ label: 'Sell building (½ price)', m });
              if (m.type === 'mortgage') acts.push({ label: `Mortgage (+${nle(s.mortgage ?? 0)})`, m });
              if (m.type === 'unmortgage') acts.push({ label: `Unmortgage (−${nle(unmortgageCost(selected))})`, m });
            }
          }
        }
        return (
          <div className="rounded-lg border-2 border-border p-3 text-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold">{s.name} <span className="text-muted">({s.type.replace('_', ' ')})</span></p>
                {s.price !== undefined && <p>Price {nle(s.price)} · Mortgage {nle(s.mortgage ?? 0)} · Houses {nle(s.houseCost ?? 0)}</p>}
                {s.rent && <p>Rent: {s.rent.join(' / ')}{s.group && ownsAll(state, myIdx, s.group) ? ' · monopoly ×2' : ''}</p>}
                {s.type === 'railway' && <p>Railway rent: {SIERRAPOLY.railwayRent[state.owners.filter((o, i) => o === owner && [5, 15, 25, 35].includes(i)).length] || 0}</p>}
                {owner !== null && <p>Owner: {state.players[owner].name}{state.mortgaged[selected] ? ' (mortgaged)' : ''}{state.buildings[selected] ? ` · ${state.buildings[selected] === 5 ? 'Hotel' : `${state.buildings[selected]} houses`}` : ''}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-muted">✕</button>
            </div>
            {acts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {acts.map((a) => <button key={a.label} onClick={() => move(a.m)} className={`btn btn-sm ${a.danger ? 'btn-danger' : 'btn-outline'}`}>{a.label}</button>)}
              </div>
            )}
          </div>
        );
      })()}

      {/* trade panel */}
      {canManage && tradeWith !== null && (() => {
        const o = tradeWith;
        const sideOk = (side: TradeSide, who: number) =>
          side.cash <= state.money[who] && side.jailCards <= state.jailCards[who].chance + state.jailCards[who].community_chest
          && side.spaces.every((i) => state.owners[i] === who && !(SIERRAPOLY_BOARD[i].group && SIERRAPOLY_GROUPS[SIERRAPOLY_BOARD[i].group].spaces.some((j) => state.buildings[j] > 0)));
        const valid = sideOk(give, myIdx) && sideOk(get, o) && engine.check(state, { type: 'trade', with: o, give, get }, myIdx) === null;
        const pick = (side: TradeSide, set: (s: TradeSide) => void, who: number, label: string) => (
          <div className="flex-1">
            <p className="font-bold">{label}</p>
            <input type="number" min={0} value={side.cash || ''} placeholder="Cash" className="mb-1 w-full rounded border px-2 py-1 text-sm"
              onChange={(e) => set({ ...side, cash: Math.max(0, Number(e.target.value) || 0) })} />
            <input type="number" min={0} max={9} value={side.jailCards || ''} placeholder="Jail cards" className="mb-1 w-full rounded border px-2 py-1 text-sm"
              onChange={(e) => set({ ...side, jailCards: Math.max(0, Number(e.target.value) || 0) })} />
            <div className="max-h-28 overflow-y-auto rounded border p-1">
              {SIERRAPOLY_BOARD.map((b) => state.owners[b.id] === who && !state.buildings[b.id] && !state.mortgaged[b.id] && (
                <label key={b.id} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={side.spaces.includes(b.id)} onChange={() => set(toggleSpace(side, b.id))} />
                  {b.name} {b.price ? `(${nle(b.price)})` : ''}
                </label>
              ))}
            </div>
          </div>
        );
        return (
          <div className="rounded-lg border-2 border-accent p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-bold">Trade with {state.players[o].name}</p>
              <button onClick={() => setTradeWith(null)} className="text-muted">✕</button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {pick(give, setGive, myIdx, 'You give')}
              {pick(get, setGet, o, 'You receive')}
            </div>
            <button disabled={!valid} onClick={() => {
              const proposal: MonopolyMove = { type: 'trade', with: o, give, get };
              // bots only accept trades that favour them
              if (state.players[o].isAI && !engine.botAcceptsTrade(state, proposal as Extract<MonopolyMove, { type: 'trade' }>)) {
                window.alert(`${state.players[o].name} declines the trade.`);
              } else {
                move(proposal);
              }
              setTradeWith(null); setGive({ spaces: [], cash: 0, jailCards: 0 }); setGet({ spaces: [], cash: 0, jailCards: 0 });
            }}
              className="btn btn-primary mt-2 w-full disabled:opacity-40">Propose trade</button>
            {!valid && <p className="mt-1 text-xs text-muted">Trades need assets you both own with no buildings; the other player (or bot) must accept.</p>}
          </div>
        );
      })()}
      {canManage && tradeWith === null && (
        <div className="flex flex-wrap justify-center gap-2">
          {state.players.map((p, i) => i !== myIdx && !state.bankrupt[i] && (
            <button key={p.id} onClick={() => { setTradeWith(i); setGive({ spaces: [], cash: 0, jailCards: 0 }); setGet({ spaces: [], cash: 0, jailCards: 0 }); }} className="btn btn-outline btn-sm">🤝 Trade with {p.name}</button>
          ))}
        </div>
      )}

      {/* log */}
      <details className="rounded-lg border border-border p-2 text-xs">
        <summary className="cursor-pointer font-bold">Game log</summary>
        <ol className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {state.log.slice(-30).map((l, i) => <li key={i}>{l}</li>)}
        </ol>
      </details>

      <div className="flex gap-2">
        <button onClick={() => start()} className="btn btn-outline flex-1">Restart</button>
        <button onClick={() => { setState(null); setSaved(null); }} className="btn btn-outline flex-1">New setup</button>
      </div>

      {over && (
        <div className="rounded-lg border-2 border-accent p-4 text-center">
          <h2 className="text-xl font-bold">{state.winner !== null ? `${state.players[state.winner].name} wins SIERRAPOLY!` : 'Game over'}</h2>
          {state.netWorths && (
            <p className="text-sm">Net worth: {state.netWorths.map((w, i) => `${state.players[i].name} ${nle(w)}`).join(' · ')}</p>
          )}
          <button onClick={() => start()} className="btn btn-primary mt-2">Play again</button>
        </div>
      )}
      <Rulebook title="SierraPoly Rulebook" sections={SIERRAPOLY_RULES} />
    </Shell>
  );
}

function ownsAll(state: MonopolyState, p: number, g: ColorGroup) {
  return SIERRAPOLY_GROUPS[g].spaces.every((i) => state.owners[i] === p);
}

function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <button onClick={onBack} className="text-secondary">← Back to {MONOPOLY_MANIFEST.name}</button>
      <div className="card space-y-4 p-5">
        <h1>🏠 {MONOPOLY_MANIFEST.name}</h1>
        {children}
      </div>
    </main>
  );
}
