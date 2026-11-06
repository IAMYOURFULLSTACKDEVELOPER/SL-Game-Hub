'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  DiceEngine, DICE_MANIFEST, DICE_TARGETS, rollDice, rollDie, createPlayer,
  type DiceState, type DicePair,
} from '@slgh/shared';
import { createClient } from '@/lib/supabase/browser';

const engine = new DiceEngine();
const MAX = DICE_MANIFEST.maxPlayers;
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

function Die({ value }: { value: number }) {
  return (
    <div className="grid h-20 w-20 grid-cols-3 grid-rows-3 gap-1 rounded-2xl border-4 border-red-500 bg-white p-2 shadow-lg">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`m-auto h-3.5 w-3.5 rounded-full ${PIPS[value].includes(i) ? 'bg-red-600' : ''}`} />
      ))}
    </div>
  );
}

function rollText(s: DiceState) {
  const r = s.lastRoll;
  if (!r) return 'Roll the dice to start!';
  const [a, b] = r.dice;
  const who = s.players[r.playerIndex].name;
  if (r.points < 0) return `${who} rolled snake eyes! ${r.points} points`;
  return `${who} rolled ${a} + ${b}${a === b ? ' — doubles!' : ''} +${r.points}`;
}

function Board({ state, myId, canRoll, onRoll, children }: {
  state: DiceState; myId?: string; canRoll: boolean; onRoll: () => void; children?: ReactNode;
}) {
  const [faces, setFaces] = useState<DicePair | null>(null);

  useEffect(() => {
    if (!state.lastRoll) return;
    const spin = setInterval(() => setFaces([rollDie(), rollDie()]), 80);
    const stop = setTimeout(() => { clearInterval(spin); setFaces(null); }, 700);
    return () => { clearInterval(spin); clearTimeout(stop); setFaces(null); };
  }, [state.turn, state.lastRoll]);

  const animating = faces !== null;
  const shown = faces ?? state.lastRoll?.dice ?? [6, 6];
  const current = state.players[state.currentPlayerIndex];
  const finished = state.status === 'finished' && state.winner !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-[#2a0f4a] p-5 text-white">
        <div className={`flex gap-4 ${animating ? 'animate-bounce' : ''}`}><Die value={shown[0]} /><Die value={shown[1]} /></div>
        <p className="min-h-6 text-center font-semibold">{animating ? 'Rolling…' : rollText(state)}</p>
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

      {!finished && (
        <button onClick={onRoll} disabled={!canRoll || animating} className="btn btn-primary w-full disabled:opacity-50">
          {canRoll ? 'Roll Dice 🎲' : `Waiting for ${current.name}…`}
        </button>
      )}
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
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="ml-2 rounded border px-2 py-1">
        {DICE_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  );
}

interface Seat { name: string; ai: boolean }

function LocalDice() {
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
      <Board state={game} canRoll={game.status === 'playing' && !aiTurn} onRoll={roll}>
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
          <select value={seats.length} onChange={(e) => resize(Number(e.target.value))} className="ml-2 rounded border px-2 py-1">
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
              className="flex-1 rounded border px-2 py-1" aria-label={`Seat ${i + 1} name`} />
            <select value={s.ai ? 'ai' : 'human'} onChange={(e) => updateSeat(i, { ai: e.target.value === 'ai' })}
              className="rounded border px-2 py-1" aria-label={`Seat ${i + 1} type`}>
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

interface Member { id: string; name: string; host: boolean; joinedAt: number }

function OnlineDice() {
  const myId = useRef(newId()).current;
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [room, setRoom] = useState<{ code: string; host: boolean } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [state, setState] = useState<DiceState | null>(null);
  const [target, setTarget] = useState<number>(50);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<DiceState | null>(null);
  const hostRef = useRef(false);

  useEffect(() => { setName(localStorage.getItem('dice_name') ?? ''); }, []);

  const publish = useCallback((s: DiceState) => {
    stateRef.current = s;
    setState(s);
    channelRef.current?.send({ type: 'broadcast', event: 'state', payload: { state: s } });
  }, []);

  const hostRoll = useCallback((by: string) => {
    const s = stateRef.current;
    if (!s || s.status !== 'playing' || s.players[s.currentPlayerIndex].id !== by) return;
    publish(engine.applyMove(s, rollDice()));
  }, [publish]);

  const leave = useCallback(() => {
    const ch = channelRef.current;
    channelRef.current = null;
    if (ch) createClient().removeChannel(ch);
    stateRef.current = null;
    hostRef.current = false;
    setRoom(null); setMembers([]); setState(null); setConnected(false);
  }, []);

  useEffect(() => leave, [leave]);

  const enter = (code: string, host: boolean) => {
    const display = name.trim() || 'Player';
    localStorage.setItem('dice_name', display);
    setError('');
    hostRef.current = host;
    const ch = createClient().channel(`dice:${code}`, { config: { presence: { key: myId }, broadcast: { self: false } } });
    channelRef.current = ch;

    ch.on('presence', { event: 'sync' }, () => {
      const list = Object.values(ch.presenceState<Member>()).map((m) => m[0])
        .sort((a, b) => a.joinedAt - b.joinedAt);
      setMembers(list);
      const s = stateRef.current;
      const inGame = s?.players.some((p) => p.id === myId);
      if (!host && !inGame && list.findIndex((m) => m.id === myId) >= MAX) {
        leave();
        setError(`Room ${code} is full (${MAX} players max).`);
      }
    });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (hostRef.current) return;
      stateRef.current = payload.state as DiceState;
      setState(payload.state as DiceState);
    });
    ch.on('broadcast', { event: 'roll' }, ({ payload }) => { if (hostRef.current) hostRoll(payload.by as string); });
    ch.on('broadcast', { event: 'hello' }, () => {
      if (hostRef.current && stateRef.current) publish(stateRef.current);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ id: myId, name: display, host, joinedAt: Date.now() } satisfies Member);
        if (!host) ch.send({ type: 'broadcast', event: 'hello', payload: {} });
        setConnected(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        leave();
        setError('Could not connect to the game server. Check your connection and try again.');
      }
    });
    setRoom({ code, host });
  };

  const hostPresent = members.some((m) => m.host);
  const hostLeft = connected && room && !room.host && members.length > 0 && !hostPresent;

  // Host skips the turn of anyone who disconnected mid-game
  useEffect(() => {
    const s = stateRef.current;
    if (!room?.host || !s || s.status !== 'playing' || members.length === 0) return;
    const online = new Set(members.map((m) => m.id));
    if (online.has(s.players[s.currentPlayerIndex].id)) return;
    for (let k = 1; k < s.players.length; k++) {
      const i = (s.currentPlayerIndex + k) % s.players.length;
      if (online.has(s.players[i].id)) { publish({ ...s, currentPlayerIndex: i, updatedAt: Date.now() }); return; }
    }
  }, [members, state, room?.host, publish]);

  const startGame = () => {
    const players = members.slice(0, MAX).map((m) => createPlayer(m.id, m.name, false));
    if (players.length < 2) { setError('Need at least 2 players to start.'); return; }
    setError('');
    publish(engine.initialize(players, { target }));
  };

  const roll = () => {
    if (room?.host) hostRoll(myId);
    else channelRef.current?.send({ type: 'broadcast', event: 'roll', payload: { by: myId } });
  };

  if (!room) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Play live with up to {MAX} friends on their own devices. Create a room and share the code.</p>
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Your name"
          className="w-full rounded border px-3 py-2" aria-label="Your name" />
        <button onClick={() => enter(newCode(), true)} className="btn btn-primary w-full">Create Room</button>
        <div className="flex gap-2">
          <input value={codeInput} maxLength={6} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ROOM CODE" className="flex-1 rounded border px-3 py-2 font-mono tracking-widest" aria-label="Room code" />
          <button onClick={() => enter(codeInput, false)} disabled={codeInput.length !== 6} className="btn btn-secondary disabled:opacity-50">Join</button>
        </div>
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

  if (hostLeft) {
    return <div className="space-y-3">{header}<p className="font-semibold">The host left the room. Leave and create a new room to keep playing.</p></div>;
  }

  if (!state) {
    return (
      <div className="space-y-3">
        {header}
        <h2 className="font-bold">Players ({Math.min(members.length, MAX)}/{MAX})</h2>
        {!connected && <p className="text-muted">Connecting…</p>}
        <ul className="space-y-1">
          {members.slice(0, MAX).map((m, i) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
              {m.name}{m.id === myId && ' (you)'}{m.host && ' 👑'}
            </li>
          ))}
        </ul>
        {connected && !room.host && !hostPresent && <p className="text-muted">Waiting for the host… check the room code if this takes long.</p>}
        {room.host ? (
          <>
            <TargetSelect value={target} onChange={setTarget} />
            <button onClick={startGame} disabled={members.length < 2} className="btn btn-primary w-full disabled:opacity-50">
              {members.length < 2 ? 'Waiting for players…' : `Start Game (${Math.min(members.length, MAX)} players)`}
            </button>
          </>
        ) : hostPresent && <p className="text-muted">Waiting for the host to start the game…</p>}
        {error && <p className="font-semibold text-red-500">{error}</p>}
      </div>
    );
  }

  const myTurn = state.status === 'playing' && state.players[state.currentPlayerIndex].id === myId;
  const spectating = !state.players.some((p) => p.id === myId);

  return (
    <div className="space-y-3">
      {header}
      {spectating && <p className="text-sm text-muted">A game is in progress — you are watching.</p>}
      <Board state={state} myId={myId} canRoll={myTurn} onRoll={roll}>
        {room.host && state.status === 'finished' && (
          <button onClick={startGame} className="btn btn-primary w-full">Play Again</button>
        )}
      </Board>
    </div>
  );
}

export default function DiceGame({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'local' | 'online'>('local');
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <button onClick={onBack} className="text-secondary">← Back to Dice</button>
      <div className="card space-y-4 p-5">
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
        {mode === 'local' ? <LocalDice /> : <OnlineDice />}
      </div>
    </main>
  );
}
