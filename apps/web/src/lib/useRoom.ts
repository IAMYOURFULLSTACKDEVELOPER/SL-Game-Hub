'use client';
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@slgh/backend/convex/_generated/api';

// Client side of convex/rooms.ts, shared by UNO and Salone-Poly.
// This browser's private secret proves which seat is ours; it never leaves this device except to the server.

export type RoomGame = 'uno' | 'salone-poly';
export const HEARTBEAT_MS = 10_000;
const SECRET_KEY = 'slgh-room-secret';
const NAME_KEY = 'slgh-player-name';
const roomKey = (game: RoomGame) => `slgh-room-${game}`;

function load(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function store(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode */ }
}
function mySecret() {
  let s = load(SECRET_KEY);
  if (!s || !/^[A-Za-z0-9-]{20,64}$/.test(s)) {
    s = `s-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}`;
    store(SECRET_KEY, s);
  }
  return s;
}
export const savedName = () => load(NAME_KEY) ?? '';
export const errorText = (e: unknown) => (e instanceof ConvexError && typeof e.data === 'string' ? e.data : 'Something went wrong. Check your connection and try again.');

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
  const joinM = useMutation(api.rooms.join);
  const leaveM = useMutation(api.rooms.leave);
  const heartbeatM = useMutation(api.rooms.heartbeat);
  const startM = useMutation(api.rooms.start);
  const moveM = useMutation(api.rooms.move);
  const offerM = useMutation(api.rooms.offerTrade);
  const respondM = useMutation(api.rooms.respondTrade);

  const joined = !!view?.me;
  // The room vanished (everyone left, or a bad link): forget it.
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
    code, view, joined, error, busy, setError,
    create: (name: string) => run(async () => {
      store(NAME_KEY, name);
      const r = await createM({ game, name, secret });
      enter(r.code);
    }),
    join: (c: string, name: string) => run(async () => {
      store(NAME_KEY, name);
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
    start: (bots: number, difficulty: 'easy' | 'medium' | 'hard', minutes?: number) =>
      run(() => startM({ code: code!, secret, bots, difficulty, minutes })),
    move: (m: Parameters<typeof moveM>[0]['move']) => run(() => moveM({ code: code!, secret, move: m })),
    offerTrade: (args: Omit<Parameters<typeof offerM>[0], 'code' | 'secret'>) => run(() => offerM({ ...args, code: code!, secret })),
    respondTrade: (accept: boolean) => run(() => respondM({ code: code!, secret, accept })),
  };
}
export type RoomApi = ReturnType<typeof useRoom>;
