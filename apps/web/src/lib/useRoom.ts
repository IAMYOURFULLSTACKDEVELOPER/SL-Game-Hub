'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { playerMessage } from '@slgh/shared/src/errors';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';

// Client side of convex/rooms.ts, shared by every online game (see convex/roomGames.ts).
// This browser's private secret proves which seat is ours; it never leaves this device except to the server.

export type RoomGame = 'uno' | 'salone-poly' | 'chess' | 'checkers' | 'snake-and-ladder' | 'scrabble' | 'word-search' | 'snake';
export const HEARTBEAT_MS = 10_000;
const SECRET_KEY = 'slgh-room-secret';
const roomKey = (game: RoomGame) => `slgh-room-${game}`;

function load(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function store(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode */ }
}
export function mySecret() {
  let s = load(SECRET_KEY);
  if (!s || !/^[A-Za-z0-9-]{20,64}$/.test(s)) {
    s = `s-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}`;
    store(SECRET_KEY, s);
  }
  return s;
}
export const errorText = (e: unknown) => playerMessage(e);

export function useRoom(game: RoomGame) {
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rejoin the room from a shared link (?room=CODE) or the last one this browser was in.
  useEffect(() => {
    setSecret(mySecret());
    const fromLink = new URLSearchParams(location.search).get('room')?.toUpperCase();
    setCode(fromLink && /^[A-Z0-9]{6}$/.test(fromLink) ? fromLink : load(roomKey(game)));
  }, [game]);

  const view = useQuery(api.rooms.view, code && secret ? { code, secret } : 'skip');
  const createM = useMutation(api.rooms.create);
  const attachM = useMutation(api.schedule.attachRoom);
  const joinM = useMutation(api.rooms.join);
  const leaveM = useMutation(api.rooms.leave);
  const heartbeatM = useMutation(api.rooms.heartbeat);
  const startM = useMutation(api.rooms.start);
  const moveM = useMutation(api.rooms.move);
  const offerM = useMutation(api.rooms.offerTrade);
  const respondM = useMutation(api.rooms.respondTrade);
  const setPublicM = useMutation(api.rooms.setPublic);
  const answerM = useMutation(api.rooms.answerRequest);
  const stakeM = useMutation(api.rooms.stake);
  const unstakeM = useMutation(api.rooms.unstakeMe);
  const scrabbleM = useAction(api.scrabbleNode.move);

  const joined = !!view?.me;
  // The room is gone (it sat empty for days, or a bad link): forget it.
  useEffect(() => { if (code && view === null) { store(roomKey(game), null); } }, [code, view, game]);

  useEffect(() => {
    if (!code || !joined) return;
    const beat = () => heartbeatM({ code, secret }).catch(() => {});
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [code, joined, secret, heartbeatM]);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(errorText(e)); return undefined; } finally { setBusy(false); }
  }, []);

  const enter = (c: string) => { setCode(c); store(roomKey(game), c); };
  return {
    game, code, secret, view, joined, error, busy, setError,
    /** Make a room. `stake` (minor units) makes it a money room: needs a signed-in player aged 18+. */
    create: (name: string, options: { stake?: number } = {}) => run(async () => {
      const r = await createM({ game, name, secret, ...options });
      enter(r.code);
      // Opened from a scheduled game: attach the room so everyone going can join it
      const event = new URLSearchParams(location.search).get('event');
      if (event) attachM({ eventId: event as Id<'scheduled_games'>, code: r.code }).catch(() => {});
    }),
    /** Money rooms: put your stake in for the next game, or take it back before it starts */
    stake: () => run(() => stakeM({ code: code!, secret })),
    unstake: () => run(() => unstakeM({ code: code!, secret })),
    join: (c: string, name: string) => run(async () => {
      const r = await joinM({ code: c.toUpperCase(), name, secret });
      enter(r.code);
    }),
    leave: () => run(async () => {
      if (code) await leaveM({ code, secret });
      setCode(null); store(roomKey(game), null);
      if (new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
    }),
    /** Look at a room before joining (from a link): forget it without telling the server. */
    forget: () => { setCode(null); store(roomKey(game), null); },
    start: (bots: number, difficulty: 'easy' | 'medium' | 'hard', minutes?: number, variant?: string) =>
      run(() => startM({ code: code!, secret, bots, difficulty, minutes, variant })),
    move: (m: Parameters<typeof moveM>[0]['move']) => run(() => moveM({ code: code!, secret, move: m })),
    /** Scrabble: every move goes through the server's dictionary check */
    scrabbleMove: (m: Parameters<typeof scrabbleM>[0]['move']) => run(() => scrabbleM({ code: code!, secret, move: m })),
    offerTrade: (args: Omit<Parameters<typeof offerM>[0], 'code' | 'secret'>) => run(() => offerM({ ...args, code: code!, secret })),
    respondTrade: (accept: boolean) => run(() => respondM({ code: code!, secret, accept })),
    /** Host: list the room in Live games, or take it off */
    setPublic: (isPublic: boolean) => run(() => setPublicM({ code: code!, secret, isPublic })),
    /** Host: let someone from Live games in, or turn them down */
    answerRequest: (requestId: string, accept: boolean) => run(() => answerM({ code: code!, secret, requestId, accept })),
  };
}
export type RoomApi = ReturnType<typeof useRoom>;
