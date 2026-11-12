'use client';
import { useEffect, useState } from 'react';
import type { RoomApi } from '@/lib/useRoom';
import { savedName, HEARTBEAT_MS } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';

type Difficulty = 'easy' | 'medium' | 'hard';

/** Create or join an online room, then wait in it until the host starts the game. */
export function RoomLobby({ room, title, maxSeats, timer = false }: { room: RoomApi; title: string; maxSeats: number; timer?: boolean }) {
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [bots, setBots] = useState(1);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [minutes, setMinutes] = useState(0);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setName(savedName()); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);

  const v = room.view;
  const humans = v?.members.length ?? 0;
  const maxBots = Math.max(0, maxSeats - humans);
  useEffect(() => { setBots((b) => Math.min(b, maxBots)); }, [maxBots]);
  const nameOk = name.trim().length >= 1;
  const errorBox = room.error && <p role="alert" className="flash rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">{room.error}</p>;

  // Not in a room yet (or a link to a room we haven't joined)
  if (!room.joined) {
    const linked = room.code && v ? room.code : null;
    return (
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="room-name">Your name</label>
          <input id="room-name" className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="What should friends call you?" autoComplete="nickname" />
        </div>
        {errorBox}
        {linked ? (
          <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="font-semibold">You were invited to {title} room <span className="font-mono tracking-widest">{linked}</span> ({humans} {humans === 1 ? 'player' : 'players'} waiting).</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary flex-1" disabled={!nameOk || room.busy} onClick={() => room.join(linked, name.trim())}><Icon name="users" size={18} />Join room</button>
              <button className="btn btn-outline" onClick={room.forget}>Not now</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-bg/50 p-4">
              <p className="font-display text-lg font-semibold">Start a room</p>
              <p className="mb-3 text-sm text-muted">Get a code to share with friends.</p>
              <button className="btn btn-primary w-full" disabled={!nameOk || room.busy} onClick={() => room.create(name.trim())}><Icon name="sparkles" size={18} />Create room</button>
            </div>
            <form className="rounded-2xl border border-border bg-bg/50 p-4" onSubmit={(e) => { e.preventDefault(); room.join(codeInput, name.trim()); }}>
              <p className="font-display text-lg font-semibold">Join a room</p>
              <p className="mb-3 text-sm text-muted">Type the 6-letter code a friend sent you.</p>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="room-code">Room code</label>
                <input id="room-code" className="input min-w-0 flex-1 text-center font-mono uppercase tracking-[0.3em]" maxLength={6} value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC234" autoCapitalize="characters" />
                <button className="btn btn-outline" disabled={!nameOk || codeInput.length !== 6 || room.busy}>Join</button>
              </div>
            </form>
          </div>
        )}
        {!nameOk && <p className="hint">Enter your name first.</p>}
      </div>
    );
  }

  // In a room, waiting for (or between) games
  const me = v!.me!;
  const link = typeof window === 'undefined' ? '' : `${location.origin}${location.pathname}?room=${v!.code}`;
  const invite = `Come and play ${title} with me on SL Game Hub! Room code ${v!.code}: ${link}`;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-secondary/10 p-4 text-center">
        <p className="text-sm font-semibold text-muted">Room code</p>
        <p className="font-mono text-4xl font-bold tracking-[0.25em] text-primary">{v!.code}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a className="btn btn-sm btn-primary" href={`https://wa.me/?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" size={16} />Invite on WhatsApp
          </a>
          <button type="button" className="btn btn-sm btn-outline" onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title, text: invite, url: link });
              else { await navigator.clipboard.writeText(invite); setCopied(true); sfx('success'); setTimeout(() => setCopied(false), 2000); }
            } catch { /* cancelled */ }
          }}>
            <Icon name={copied ? 'check' : 'arrowRight'} size={16} />{copied ? 'Copied' : 'Share link'}
          </button>
        </div>
      </div>

      <div>
        <p className="label">Players ({humans}/{maxSeats})</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {v!.members.map((m, i) => {
            const online = now - m.lastSeen < HEARTBEAT_MS * 2.5;
            return (
              <li key={m.id} className="pop-in flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5" style={{ ['--i' as string]: i }}>
                <span className="avatar-ring h-9 w-9 font-display font-bold">{m.name[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{m.name}{m.id === me.id ? ' (you)' : ''}</span>
                {m.host && <span className="chip chip-accent">Host</span>}
                <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-primary' : 'bg-border'}`} title={online ? 'Online' : 'Reconnecting'} />
              </li>
            );
          })}
        </ul>
        {humans < maxSeats && <p className="hint">Waiting for friends? Empty seats can be filled with bots.</p>}
      </div>

      {errorBox}
      {me.host ? (
        <div className="space-y-3 rounded-2xl border border-border bg-bg/50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">Bots
              <select className="field" value={bots} onChange={(e) => setBots(Number(e.target.value))}>
                {Array.from({ length: maxBots + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {bots > 0 && (
              <label className="flex items-center gap-2 text-sm font-semibold">Level
                <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </label>
            )}
            {timer && (
              <label className="flex items-center gap-2 text-sm font-semibold">Time limit
                <select className="field" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  <option value={0}>None</option><option value={20}>20 min</option><option value={40}>40 min</option><option value={60}>60 min</option>
                </select>
              </label>
            )}
          </div>
          <button className="btn btn-primary btn-lg w-full" disabled={room.busy || humans + bots < 2} onClick={() => { sfx('shuffle'); room.start(bots, difficulty, timer ? minutes : undefined); }}>
            <Icon name="play" size={20} />Start game ({humans + bots} players)
          </button>
          {humans + bots < 2 && <p className="hint text-center">You need at least 2 players. Add a bot or invite a friend.</p>}
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-bg/60 p-4 text-center font-semibold text-muted">
          <span className="loading-dots">Waiting for the host to start</span>
        </p>
      )}
      <button type="button" className="btn btn-ghost w-full text-danger" onClick={room.leave}><Icon name="logout" size={18} />Leave room</button>
    </div>
  );
}
