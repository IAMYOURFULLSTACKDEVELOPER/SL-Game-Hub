'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DiceEngine, DICE_MANIFEST, DICE_TARGETS, rollDice, createPlayer,
  type DiceState,
} from '@slgh/shared';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@slgh/backend/convex/_generated/api';
import { formatLeones, parseLeones } from '@slgh/shared/src/wallet';
import Die3D from './Die3D';
import { ConvexClientProvider } from './ConvexClientProvider';
import { sfx } from '@/lib/sound';
import { useEndSfx } from '@/lib/useGameSfx';

const engine = new DiceEngine();
const MAX = DICE_MANIFEST.maxPlayers;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export type RollMode = 'tap' | 'shake';
const ROLL_MS = 1150;
const SHAKE_DELTA = 14; // change in acceleration (m/s²) between readings that counts as shaking
const SHAKE_MIN_MS = 250;
const SHAKE_STOP_MS = 350;

/** Rattle while the device is shaken; throw when the shaking stops */
function useShake(active: boolean, onThrow: () => void) {
  const [shaking, setShaking] = useState(false);
  const [noSensor, setNoSensor] = useState(false);
  const throwRef = useRef(onThrow);
  throwRef.current = onThrow;

  useEffect(() => {
    if (!active) return;
    if (!('DeviceMotionEvent' in window)) { setNoSensor(true); return; }
    let last: { x: number; y: number; z: number } | null = null;
    let seen = false;
    let startedAt = 0;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const probe = setTimeout(() => { if (!seen) setNoSensor(true); }, 1500);
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null || a.z == null) return;
      seen = true;
      setNoSensor(false);
      const now = { x: a.x, y: a.y, z: a.z };
      if (last && Math.abs(now.x - last.x) + Math.abs(now.y - last.y) + Math.abs(now.z - last.z) > SHAKE_DELTA) {
        if (!startedAt) { startedAt = Date.now(); setShaking(true); }
        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
          const long = Date.now() - startedAt >= SHAKE_MIN_MS + SHAKE_STOP_MS;
          startedAt = 0;
          setShaking(false);
          if (long) throwRef.current();
        }, SHAKE_STOP_MS);
      }
      last = now;
    };
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      clearTimeout(probe);
      clearTimeout(stopTimer);
      setShaking(false);
    };
  }, [active]);

  return { shaking, noSensor };
}

function rollText(s: DiceState) {
  const r = s.lastRoll;
  if (!r) return 'Roll the dice to start!';
  const [a, b] = r.dice;
  const who = s.players[r.playerIndex].name;
  if (r.points < 0) return `${who} rolled snake eyes! ${r.points} points`;
  return `${who} rolled ${a} + ${b}${a === b ? ' — doubles!' : ''} +${r.points}`;
}

function Board({ state, myId, canRoll, onRoll, rollMode, children }: {
  state: DiceState; myId?: string; canRoll: boolean; onRoll: () => void; rollMode: RollMode; children?: ReactNode;
}) {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!state.lastRoll) return;
    setAnimating(true);
    sfx('dice');
    navigator.vibrate?.(40);
    const t = setTimeout(() => setAnimating(false), ROLL_MS);
    return () => clearTimeout(t);
  }, [state.turn, state.lastRoll]);

  const shown = state.lastRoll?.dice ?? [6, 6];
  const current = state.players[state.currentPlayerIndex];
  const finished = state.status === 'finished' && state.winner !== null;
  useEndSfx(finished);
  const ready = canRoll && !animating && !finished;
  const { shaking, noSensor } = useShake(rollMode === 'shake' && ready, onRoll);
  const showShakePanel = rollMode === 'shake' && canRoll && !noSensor;

  return (
    <div className="space-y-4">
      <div className="dice-tray flex flex-col items-center gap-3 rounded-xl p-5 text-white">
        <div className={`flex h-32 items-center justify-center gap-8 ${shaking ? 'dice-rattle' : ''}`} data-testid="dice-tray">
          {shown.map((v, k) => (
            <div key={`${state.turn}-${k}`} className={state.lastRoll ? 'sl-die-drop' : ''} style={{ animationDelay: `${k * 90}ms` }}>
              <Die3D value={v} size={76} still={!state.lastRoll} delayMs={k * 90} />
            </div>
          ))}
        </div>
        <p className="min-h-6 text-center font-semibold">
          {shaking ? 'Rattling… stop shaking to throw!' : animating ? 'Rolling…' : rollText(state)}
        </p>
        {!finished && (
          <p className="text-sm opacity-80">
            Turn: <strong style={{ color: COLORS[state.currentPlayerIndex] }}>{current.name}</strong>
            {myId && current.id === myId && ' (you)'}
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {state.players.map((p, i) => (
          <li key={p.id} className={`rounded-lg border-2 p-2 ${i === state.currentPlayerIndex && !finished ? 'border-primary' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2 text-sm font-bold">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                {p.name}{myId === p.id && ' (you)'}{p.isAI && ' 🤖'}
              </span>
              <span>{state.scores[i]} / {state.target}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-border">
              <div className="h-full transition-all" style={{ width: `${Math.min(100, (state.scores[i] / state.target) * 100)}%`, backgroundColor: COLORS[i] }} />
            </div>
          </li>
        ))}
      </ul>

      {!finished && (showShakePanel ? (
        <div className="rounded-lg border-2 border-dashed border-primary p-3 text-center font-bold" aria-live="polite">
          {shaking ? '🎲 Rattling… stop shaking to throw!' : animating ? 'Rolling…' : '📳 Shake your phone to roll'}
        </div>
      ) : (
        <>
          {rollMode === 'shake' && canRoll && noSensor && (
            <p className="text-center text-sm text-muted">This device can&apos;t detect shaking — tap the button to roll instead.</p>
          )}
          <button onClick={onRoll} disabled={!canRoll || animating} className="btn btn-primary w-full disabled:opacity-50">
            {canRoll ? 'Roll Dice 🎲' : `Waiting for ${current.name}…`}
          </button>
        </>
      ))}
      {finished && !animating && (
        <div className="rounded-lg border-2 border-accent p-4 text-center">
          <h2 className="text-xl font-bold">🏆 {state.players[state.winner!].name} wins!</h2>
          <p className="text-muted">Reached {state.scores[state.winner!]} points.</p>
        </div>
      )}
      {children}
    </div>
  );
}

function TargetSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="text-sm font-semibold">
      Target score:
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="ml-2 field">
        {DICE_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  );
}

interface Seat { name: string; ai: boolean }

function LocalDice({ rollMode }: { rollMode: RollMode }) {
  const [seats, setSeats] = useState<Seat[]>([{ name: 'Player 1', ai: false }, { name: 'Bot 2', ai: true }]);
  const [target, setTarget] = useState<number>(50);
  const [game, setGame] = useState<DiceState | null>(null);

  const resize = (n: number) => setSeats((s) => Array.from({ length: n }, (_, i) => s[i] ?? { name: `Player ${i + 1}`, ai: false }));
  const updateSeat = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const start = () => setGame(engine.initialize(
    seats.map((s, i) => createPlayer(`seat${i}`, s.name.trim() || `Player ${i + 1}`, s.ai, s.ai ? 'medium' : undefined)),
    { target },
  ));
  const roll = useCallback(() => setGame((g) => (g && g.status === 'playing' ? engine.applyMove(g, rollDice()) : g)), []);

  const aiTurn = game?.status === 'playing' && game.players[game.currentPlayerIndex].isAI;
  useEffect(() => {
    if (!aiTurn) return;
    const t = setTimeout(roll, 1200);
    return () => clearTimeout(t);
  }, [aiTurn, game?.turn, roll]);

  if (game) {
    return (
      <Board state={game} canRoll={game.status === 'playing' && !aiTurn} onRoll={roll} rollMode={rollMode}>
        <div className="flex gap-2">
          <button onClick={start} className="btn btn-secondary flex-1">Restart</button>
          <button onClick={() => setGame(null)} className="btn btn-secondary flex-1">Change players</button>
        </div>
      </Board>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Pass the device around, or fill seats with bots.</p>
      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-semibold">
          Players:
          <select value={seats.length} onChange={(e) => resize(Number(e.target.value))} className="ml-2 field">
            {Array.from({ length: MAX - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <TargetSelect value={target} onChange={setTarget} />
      </div>
      <ul className="space-y-2">
        {seats.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i] }} />
            <input value={s.name} maxLength={20} onChange={(e) => updateSeat(i, { name: e.target.value })}
              className="field min-w-0 flex-1" aria-label={`Seat ${i + 1} name`} />
            <select value={s.ai ? 'ai' : 'human'} onChange={(e) => updateSeat(i, { ai: e.target.value === 'ai' })}
              className="field" aria-label={`Seat ${i + 1} type`}>
              <option value="human">Human</option>
              <option value="ai">Bot</option>
            </select>
          </li>
        ))}
      </ul>
      <button onClick={start} className="btn btn-primary w-full">Start Game</button>
    </div>
  );
}

interface Member { id: string; name: string; host: boolean; joinedAt: number; staked: boolean }
const HEARTBEAT_MS = 10_000; // keep in step with packages/backend/convex/dice.ts
const money = (minor: number) => formatLeones(minor);

/** Online play talks to Convex as the signed-in player when there is one (money rooms need it; free rooms don't). */
function OnlineDiceRoom({ rollMode }: { rollMode: RollMode }) {
  return <ConvexClientProvider><OnlineDice rollMode={rollMode} /></ConvexClientProvider>;
}

// The room lives in Convex: everyone subscribes to it, and the server makes every roll.
// Money rooms: everyone stakes the same amount from their wallet; the server holds it and pays the winner.
function OnlineDice({ rollMode }: { rollMode: RollMode }) {
  const anonId = useRef(newId()).current;
  const me = useQuery(api.users.me);
  const wallet = useQuery(api.wallet.summary, me ? {} : 'skip');
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [forMoney, setForMoney] = useState(false);
  const [stakeInput, setStakeInput] = useState('5');
  const [room, setRoom] = useState<{ code: string; memberId: string } | null>(null);
  const [target, setTarget] = useState<number>(50);
  const [error, setError] = useState('');
  const [rollSent, setRollSent] = useState(false);
  const live = useQuery(api.dice.room, room ? { code: room.code } : 'skip');
  const peek = useQuery(api.dice.room, !room && codeInput.length === 6 ? { code: codeInput } : 'skip');
  const join = useMutation(api.dice.join);
  const heartbeat = useMutation(api.dice.heartbeat);
  const leaveRoom = useMutation(api.dice.leave);
  const startRoom = useMutation(api.dice.start);
  const rollInRoom = useMutation(api.dice.roll);
  const stakeMe = useMutation(api.dice.stake);
  const unstakeMe = useMutation(api.dice.unstakeMe);

  const myId = room?.memberId ?? anonId;
  const members: Member[] = live?.members ?? [];
  const state = live?.state ?? null;
  const stake = live?.stake ?? null;
  const connected = members.some((m) => m.id === myId);
  const amHost = members.some((m) => m.id === myId && m.host); // the server hands hosting on if the host leaves
  const canUseWallet = !!me && !!wallet?.eligible;

  useEffect(() => { setName(localStorage.getItem('dice_name') ?? ''); }, []);
  useEffect(() => { if (me?.username) setName((n) => n || me.username); }, [me?.username]);

  const fail = useCallback((e: unknown) => setError(e instanceof ConvexError
    ? (e.data === 'auth required' ? 'Sign in to play for money.' : String(e.data))
    : 'Could not connect to the game server. Check your connection and try again.'), []);

  const leave = useCallback(() => {
    if (stake !== null && state?.status === 'playing' && state.players.some((p) => p.id === myId)
      && !confirm('The round is still being played. If you leave now you lose your stake. Leave anyway?')) return;
    setRoom(null);
  }, [stake, state, myId]);

  // While in a room: send heartbeats so others see us as present, and say goodbye when leaving or closing the tab.
  useEffect(() => {
    if (!room) return;
    const args = { code: room.code, memberId: room.memberId };
    const bye = () => { void leaveRoom(args).catch(() => {}); };
    const beat = setInterval(() => {
      heartbeat(args).catch((e) => { setRoom(null); fail(e); });
    }, HEARTBEAT_MS);
    window.addEventListener('pagehide', bye);
    return () => { clearInterval(beat); window.removeEventListener('pagehide', bye); bye(); };
  }, [room, heartbeat, leaveRoom, fail]);

  // Everyone left and the room was closed (e.g. after a long disconnection)
  useEffect(() => {
    if (room && live === null) { setRoom(null); setError(`Room ${room.code} has closed.`); }
  }, [room, live]);

  const enter = async (code: string, host: boolean, roomStake: number | null) => {
    const display = name.trim() || 'Player';
    localStorage.setItem('dice_name', display);
    setError('');
    if (roomStake !== null) {
      if (!me) { setError('Sign in to play for money.'); return; }
      if (!wallet?.eligible) { setError('Playing for money is only for players aged 18 and over.'); return; }
      if (!confirm(`${host ? 'Create' : 'Join'} a money room? ${money(roomStake)} will be taken from your wallet and held until the round ends. The winner takes the pot.`)) return;
    }
    const memberId = roomStake !== null ? me!.id : anonId;
    try {
      await join({ code, memberId, name: display, host, ...(host && roomStake !== null ? { stake: roomStake } : {}) });
      setRoom({ code, memberId });
    } catch (e) { fail(e); }
  };

  const createRoom = () => {
    if (!forMoney) return enter(newCode(), true, null);
    const minor = parseLeones(stakeInput);
    if (minor === null) { setError('Enter the stake in leones, e.g. 5.'); return; }
    return enter(newCode(), true, minor);
  };

  const hostPresent = members.some((m) => m.host);
  const players = stake !== null ? members.filter((m) => m.staked) : members.slice(0, MAX);
  const meStaked = members.some((m) => m.id === myId && m.staked);
  const potOpen = live?.pot?.status === 'open';

  const startGame = () => {
    if (!room) return;
    if (players.length < 2) { setError(stake !== null ? 'At least 2 players must stake first.' : 'Need at least 2 players to start.'); return; }
    setError('');
    startRoom({ code: room.code, memberId: myId, target }).catch(fail);
  };
  const stakeAgain = () => { if (room) { setError(''); stakeMe({ code: room.code, memberId: myId }).catch(fail); } };
  const takeBack = () => { if (room) { setError(''); unstakeMe({ code: room.code, memberId: myId }).catch(fail); } };

  // A player waits for the server's next state before it can send another roll
  useEffect(() => { setRollSent(false); }, [state?.turn, state?.currentPlayerIndex, state?.status]);

  const roll = () => {
    if (!room || rollSent) return;
    setRollSent(true);
    rollInRoom({ code: room.code, memberId: myId }).catch((e) => { setRollSent(false); fail(e); });
  };

  if (!room) {
    const peekStake = peek?.stake ?? null;
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Play live with up to {MAX} friends on their own devices. Create a room and share the code.</p>
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Your name"
          className="input" aria-label="Your name" />
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Room type">
          {([false, true] as const).map((m) => (
            <button key={String(m)} role="radio" aria-checked={forMoney === m} onClick={() => setForMoney(m)}
              className={`btn btn-sm ${forMoney === m ? 'btn-primary' : 'btn-secondary'}`}>
              {m ? '💰 For money' : '🎉 Just for fun'}
            </button>
          ))}
        </div>
        {forMoney && (
          !me ? <p className="text-sm"><Link href="/login?next=/games/dice/play" className="font-semibold text-primary underline">Sign in</Link> to play for money.</p>
          : !canUseWallet ? <p className="text-sm text-muted">{wallet === undefined ? 'Checking your wallet…' : 'Playing for money is only for players aged 18 and over.'}</p>
          : (
            <div className="space-y-1">
              <label className="label" htmlFor="dice-stake">Stake per player (SLE)</label>
              <input id="dice-stake" inputMode="decimal" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} className="input" />
              <p className="text-xs text-muted">
                Wallet: <b>{money(wallet!.balance)}</b> · <Link href="/wallet" className="text-primary underline">Top up</Link>.
                Stakes are held by SL Game Hub until the round ends; the winner gets the whole pot.
              </p>
            </div>
          )
        )}
        <button onClick={createRoom} disabled={forMoney && !canUseWallet} className="btn btn-primary w-full">
          {forMoney ? 'Create Money Room' : 'Create Room'}
        </button>
        <div className="flex gap-2">
          <input value={codeInput} maxLength={6} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ROOM CODE" className="input min-w-0 flex-1 font-mono tracking-widest" aria-label="Room code" />
          <button onClick={() => enter(codeInput, false, peekStake)} disabled={codeInput.length !== 6} className="btn btn-secondary disabled:opacity-50">
            {peekStake !== null ? `Join · stake ${money(peekStake)}` : 'Join'}
          </button>
        </div>
        {peekStake !== null && <p className="text-sm text-muted">💰 This is a money room: joining puts {money(peekStake)} from your wallet into the pot.</p>}
        {error && <p className="font-semibold text-red-500">{error}</p>}
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between rounded-lg border-2 border-border p-3">
      <div>
        <p className="text-xs text-muted">Room code</p>
        <p className="font-mono text-2xl font-extrabold tracking-widest">{room.code}</p>
      </div>
      <button onClick={leave} className="btn btn-secondary">Leave</button>
    </div>
  );

  // Money rooms: the pot, and whether I'm in it
  const potPanel = stake !== null && live?.pot && (
    <div className="space-y-2 rounded-lg border-2 border-accent/60 p-3">
      <p className="flex flex-wrap justify-between gap-2 font-semibold">
        <span>💰 Stake {money(stake)} each</span>
        <span>Pot: {money(live.pot.total)}{live.pot.feeBps > 0 && <span className="text-xs text-muted"> ({live.pot.feeBps / 100}% fee)</span>}</span>
      </p>
      {potOpen && (meStaked ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>✅ Your stake is in for this round.</span>
          <button onClick={takeBack} className="btn btn-ghost btn-sm">Take it back</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={stakeAgain} className="btn btn-primary btn-sm">Stake {money(stake)} to play</button>
          <span className="text-muted">Wallet: {wallet ? money(wallet.balance) : '…'} · <Link href="/wallet" className="text-primary underline">Top up</Link></span>
        </div>
      ))}
    </div>
  );

  if (!state) {
    return (
      <div className="space-y-3">
        {header}
        {potPanel}
        <h2 className="font-bold">Players ({Math.min(members.length, MAX)}/{MAX})</h2>
        {!connected && <p className="text-muted">Connecting…</p>}
        <ul className="space-y-1">
          {members.slice(0, MAX).map((m, i) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
              {m.name}{m.id === myId && ' (you)'}{m.host && ' 👑'}{stake !== null && (m.staked ? ' 💰' : ' (not staked)')}
            </li>
          ))}
        </ul>
        {connected && !hostPresent && <p className="text-muted">Waiting for the host… check the room code if this takes long.</p>}
        {amHost ? (
          <>
            <TargetSelect value={target} onChange={setTarget} />
            <button onClick={startGame} disabled={players.length < 2} className="btn btn-primary w-full disabled:opacity-50">
              {players.length < 2 ? (stake !== null ? 'Waiting for 2 players to stake…' : 'Waiting for players…') : `Start Game (${Math.min(players.length, MAX)} players)`}
            </button>
          </>
        ) : hostPresent && <p className="text-muted">Waiting for the host to start the game…</p>}
        {error && <p className="font-semibold text-red-500">{error}</p>}
      </div>
    );
  }

  const myTurn = state.status === 'playing' && state.players[state.currentPlayerIndex].id === myId;
  const spectating = !state.players.some((p) => p.id === myId);
  const finished = state.status === 'finished';
  const iWon = finished && state.winner !== null && state.players[state.winner].id === myId;

  return (
    <div className="space-y-3">
      {header}
      {spectating && !finished && <p className="text-sm text-muted">A game is in progress — you are watching.</p>}
      <Board state={state} myId={myId} canRoll={myTurn && !rollSent} onRoll={roll} rollMode={rollMode}>
        {finished && stake !== null && live?.lastPrize != null && (
          <p className="rounded-lg bg-accent/15 p-3 text-center font-semibold">
            {iWon ? `🎉 You won ${money(live.lastPrize)}! It is in your wallet: stake again below or leave with it.`
              : `${state.players[state.winner!].name} won ${money(live.lastPrize)}.`}
          </p>
        )}
        {finished && potPanel}
        {amHost && finished && (
          <>
            <TargetSelect value={target} onChange={setTarget} />
            <button onClick={startGame} disabled={players.length < 2} className="btn btn-primary w-full">
              {stake !== null ? `Play Again (${players.length} staked)` : 'Play Again'}
            </button>
          </>
        )}
        {error && <p className="font-semibold text-red-500">{error}</p>}
      </Board>
    </div>
  );
}

export default function DiceGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [rollMode, setRollMode] = useState<RollMode>('tap');
  const [motionError, setMotionError] = useState('');

  useEffect(() => { if (localStorage.getItem('dice_roll_mode') === 'shake') setRollMode('shake'); }, []);

  const chooseRollMode = async (m: RollMode) => {
    setMotionError('');
    if (m === 'shake') {
      // iPhone and iPad only report motion after the player allows it from a tap
      const request = (globalThis.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined)?.requestPermission;
      if (request) {
        const answer = await request().catch(() => 'denied');
        if (answer !== 'granted') { setMotionError('Motion access was not allowed, so shaking cannot be detected. Using tap to roll.'); return; }
      }
    }
    setRollMode(m);
    localStorage.setItem('dice_roll_mode', m);
  };
  return (
    <main className="mx-auto max-w-2xl space-y-3 px-2 py-3 sm:space-y-4 sm:p-4">
      <button onClick={onBack} className="back-link">← Back to Dice</button>
      <div className="card space-y-4 p-3 sm:p-5">
        <div>
          <h1>🎲 {DICE_MANIFEST.name}</h1>
          <p className="text-sm text-muted">
            Roll two dice and add them to your score. Doubles score double, snake eyes (1 + 1) cost 10 points. First to the target wins!
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2" role="tablist">
          {(['local', 'online'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'}`}>
              {m === 'local' ? 'Same device' : `Online (up to ${MAX})`}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">How do you want to roll?</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to roll">
            {(['tap', 'shake'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={rollMode === m} onClick={() => chooseRollMode(m)}
                className={`btn ${rollMode === m ? 'btn-primary' : 'btn-secondary'}`}>
                {m === 'tap' ? '👆 Tap to roll' : '📳 Shake to roll'}
              </button>
            ))}
          </div>
          {motionError && <p className="text-sm font-semibold text-red-500">{motionError}</p>}
        </div>
        {mode === 'local' ? <LocalDice rollMode={rollMode} /> : <OnlineDiceRoom rollMode={rollMode} />}
      </div>
    </main>
  );
}
