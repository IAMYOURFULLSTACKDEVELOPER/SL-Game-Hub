'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { WALLET_LIMITS, formatLeones, parseLeones } from '@slgh/shared/src/wallet';
import type { RoomApi } from '@/lib/useRoom';
import { HEARTBEAT_MS } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';
import type { GameVariant } from '@slgh/shared';
import { Icon } from './Icon';
import { VariantPicker } from './VariantPicker';
import { RecentRooms, RoomsLeft } from './RecentRooms';
import { InviteFriends } from './social/Social';

type Difficulty = 'easy' | 'medium' | 'hard';

/** Host only: people asking to join from Live games. Shown in the lobby and during a game. */
export function JoinRequests({ room }: { room: RoomApi }) {
  const v = room.view;
  const requests = v?.me?.host ? v.requests : [];
  const prev = useRef(0);
  useEffect(() => { if (requests.length > prev.current) sfx('success'); prev.current = requests.length; }, [requests.length]);
  if (!requests.length) return null;
  const playing = (v?.state as { status?: string } | null)?.status === 'playing';
  return (
    <div className="flash space-y-2 rounded-lg border-l-4 border-accent bg-accent/10 p-3" aria-live="polite">
      <p className="text-sm font-semibold">
        {requests.length === 1 ? 'Someone wants' : `${requests.length} people want`} to join from Live games
        {playing && <span className="font-normal text-muted"> (they can join when this game ends)</span>}
      </p>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span className="avatar-ring h-8 w-8 shrink-0 font-display text-sm font-bold">{r.name[0]?.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <button className="btn btn-sm btn-primary" disabled={room.busy} onClick={() => room.answerRequest(r.id, true)}>Let in</button>
            <button className="btn btn-sm btn-outline" disabled={room.busy} onClick={() => room.answerRequest(r.id, false)}>No thanks</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Create or join an online room, then wait in it until the host starts the game. */
export function RoomLobby({ room, title, maxSeats, timer = false, bots: allowBots = true, timerOptions = [20, 40, 60], variants }: {
  room: RoomApi; title: string; maxSeats: number; timer?: boolean;
  /** Races (Word Search, Snake) are people only */
  bots?: boolean;
  timerOptions?: number[];
  /** Ways to play this game; the host picks one before each game */
  variants?: readonly GameVariant[];
}) {
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [bots, setBots] = useState(1);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [minutes, setMinutes] = useState(0);
  const [variant, setVariant] = useState(variants?.[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  // Money rooms: needs a signed-in player aged 18+ with money in their wallet (Snake can't be played for money).
  const [forMoney, setForMoney] = useState(false);
  const [stakeInput, setStakeInput] = useState('5');
  const canPlayForMoney = room.game !== 'snake';
  const account = useQuery(api.users.me); // online play needs an account (free is fine): free players make 10 rooms a day
  const recent = useQuery(api.rooms.recent, account && !room.joined ? { game: room.game } : 'skip');
  const outOfRooms = recent?.roomsLeft === 0;
  const wallet = useQuery(api.wallet.summary, canPlayForMoney && account ? {} : 'skip');
  // The "List in Live games" box flips at once; the server's answer then takes over.
  const [listedNow, setListedNow] = useState<boolean | null>(null);
  const serverListed = room.view?.isPublic;
  useEffect(() => { setListedNow(null); }, [serverListed]);
  useEffect(() => { if (room.error) setListedNow(null); }, [room.error]); // the change didn't save
  const [now, setNow] = useState(() => Date.now());
  // Your username by default; changing it here only renames you in this game.
  const nameEdited = useRef(false);
  useEffect(() => { if (account?.username && !nameEdited.current) setName(account.username); }, [account?.username]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);

  const v = room.view;
  const humans = v?.members.length ?? 0;
  const maxBots = allowBots ? Math.max(0, maxSeats - humans) : 0;
  useEffect(() => { setBots((b) => Math.min(b, maxBots)); }, [maxBots]);
  const nameOk = name.trim().length >= 1;
  const money = v?.money ?? null;
  const stakers = v?.members.filter((m) => m.staked).length ?? 0;
  const moneyBlock = !account ? 'signin' : wallet && !wallet.eligible ? 'age' : null;
  const errorBox = room.error && <p role="alert" className="flash rounded-lg border-l-4 border-danger bg-danger/10 p-3 text-sm font-medium text-heading">{room.error}</p>;

  // Not in a room yet (or a link to a room we haven't joined)
  if (!room.joined) {
    const linked = room.code && v ? room.code : null;
    // Online play is for registered players only: guests get a way to sign in instead of the room forms.
    if (account === null) {
      const next = typeof window === 'undefined' ? '/games' : location.pathname + location.search;
      return (
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <span className="icon-badge icon-badge-blue h-12 w-12 rounded-2xl"><Icon name="users" size={24} /></span>
          <h2 className="text-lg">Sign in to play online</h2>
          <p className="max-w-sm text-sm text-muted">
            {linked ? <>You were invited to {title} room <span className="font-mono tracking-widest">{linked}</span>. </> : null}
            Online rooms are for registered players. A free account takes a minute; games against bots on this device need no account.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-primary"><Icon name="login" size={18} />Sign in</Link>
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-outline">Create a free account</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="room-name">Your name</label>
          <input id="room-name" className="input" maxLength={20} value={name} onChange={(e) => { nameEdited.current = true; setName(e.target.value); }} placeholder="What should friends call you?" autoComplete="nickname" aria-describedby="room-name-help" />
          <p id="room-name-help" className="mt-1 text-xs text-muted">Your username is used. Change it if you want a different name in this game.</p>
        </div>
        {errorBox}
        {linked ? (
          <div className="card space-y-3 p-4">
            <p className="font-semibold">
              {recent?.rooms.some((r) => r.code === linked) ? 'Welcome back to' : 'You were invited to'} {title} room <span className="font-mono tracking-widest">{linked}</span>{' '}
              ({humans === 0 ? 'nobody is in it yet' : `${humans} ${humans === 1 ? 'player' : 'players'} waiting`}).
            </p>
            {money && (moneyBlock === 'signin' ? (
              <p className="text-sm"><Icon name="coins" size={16} className="mr-1 inline-block align-[-3px] text-accent" />This room is played for money. <Link href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/games' : `${location.pathname}?room=${linked}`)}`} className="font-semibold text-primary underline">Sign in</Link> to join.</p>
            ) : moneyBlock === 'age' ? (
              <p className="text-sm text-muted"><Icon name="coins" size={16} className="mr-1 inline-block align-[-3px]" />This room is played for money, which is only for players aged 18 and over.</p>
            ) : (
              <p className="text-sm"><Icon name="coins" size={16} className="mr-1 inline-block align-[-3px] text-accent" />Played for money: joining puts <b>{formatLeones(money.stake)}</b> from your wallet into the pot (you have {wallet ? formatLeones(wallet.balance) : '…'}).</p>
            ))}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary flex-1" disabled={!nameOk || room.busy || (!!money && !!moneyBlock)} onClick={() => {
                if (money && !confirm(`Join and put ${formatLeones(money.stake)} into the pot? The winner takes the pot; leaving mid-game forfeits your stake.`)) return;
                room.join(linked, name.trim());
              }}><Icon name="users" size={18} />Join room</button>
              <button className="btn btn-secondary" onClick={room.forget}>Not now</button>
            </div>
          </div>
        ) : (
          <>
          <RecentRooms data={recent} now={now} disabled={!nameOk || room.busy} onRejoin={(r) => {
            if (r.stake !== null && !confirm(`Rejoin and put ${formatLeones(r.stake)} into the pot? The winner takes the pot; leaving mid-game forfeits your stake.`)) return;
            room.join(r.code, name.trim());
          }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card flex flex-col p-4">
              <p className="flex items-center gap-2 text-base font-bold text-heading"><span className="icon-badge icon-badge-blue h-8 w-8"><Icon name="plus" size={16} /></span>Start a room</p>
              <p className="mb-3 text-sm text-muted">Get a code to share with friends.</p>
              {canPlayForMoney && (
                <div className="mb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Play for">
                    {([false, true] as const).map((m) => (
                      <button key={String(m)} type="button" role="radio" aria-checked={forMoney === m} onClick={() => setForMoney(m)}
                        className={`btn btn-sm ${forMoney === m ? 'btn-primary' : 'btn-secondary'}`}><Icon name={m ? 'coins' : 'party'} size={16} />{m ? 'For money' : 'Free'}</button>
                    ))}
                  </div>
                  {forMoney && (moneyBlock === 'signin' ? (
                    <p className="text-sm"><Link href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/games' : location.pathname)}`} className="font-semibold text-primary underline">Sign in</Link> to play for money.</p>
                  ) : moneyBlock === 'age' ? (
                    <p className="text-sm text-muted">Playing for money is only for players aged 18 and over.</p>
                  ) : (
                    <div>
                      <label className="label" htmlFor="room-stake">Stake per player (SLE)</label>
                      <input id="room-stake" className="input" inputMode="decimal" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} />
                      <p className="hint">Wallet: <b>{wallet ? formatLeones(wallet.balance) : '…'}</b> · <Link href="/wallet" className="text-primary underline">Top up</Link>. No bots in money rooms.</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mb-3"><RoomsLeft data={recent} /></div>
              <button className="btn btn-primary mt-auto w-full" disabled={!nameOk || room.busy || outOfRooms || (forMoney && !!moneyBlock)} onClick={() => {
                if (!forMoney) { room.create(name.trim()); return; }
                const stake = parseLeones(stakeInput);
                if (stake === null || stake < WALLET_LIMITS.minStake) { room.setError(`Enter a stake of at least ${formatLeones(WALLET_LIMITS.minStake)}.`); return; }
                if (confirm(`Create a money room? ${formatLeones(stake)} goes from your wallet into the pot until the game ends. The winner takes the pot.`)) room.create(name.trim(), { stake });
              }}><Icon name="plus" size={18} />{forMoney ? 'Create money room' : 'Create room'}</button>
            </div>
            <form className="card p-4" onSubmit={(e) => { e.preventDefault(); room.join(codeInput, name.trim()); }}>
              <p className="flex items-center gap-2 text-base font-bold text-heading"><span className="icon-badge h-8 w-8 bg-success text-white"><Icon name="users" size={16} /></span>Join a room</p>
              <p className="mb-3 text-sm text-muted">Type the 6-letter code a friend sent you.</p>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="room-code">Room code</label>
                <input id="room-code" className="input min-w-0 flex-1 text-center font-mono uppercase tracking-[0.3em]" maxLength={6} value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC234" autoCapitalize="characters" />
                <button className="btn btn-success" disabled={!nameOk || codeInput.length !== 6 || room.busy}>Join</button>
              </div>
            </form>
          </div>
          </>
        )}
        {!nameOk && <p className="hint">Enter your name first.</p>}
      </div>
    );
  }

  // In a room, waiting for (or between) games
  const me = v!.me!;
  const link = typeof window === 'undefined' ? '' : `${location.origin}${location.pathname}?room=${v!.code}`;
  const invite = `Come and play ${title} with me on Dodo! Room code ${v!.code}: ${link}`;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="label">Room code</p>
        <div className="flex items-center gap-3 rounded-lg bg-input p-2 pl-4">
          <p className="min-w-0 flex-1 font-mono text-3xl font-bold tracking-[0.25em] text-heading">{v!.code}</p>
          <span className="online-dot" aria-hidden />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn btn-sm btn-success" href={`https://wa.me/?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" size={16} />Invite on WhatsApp
          </a>
          <button type="button" className="btn btn-sm btn-primary" onClick={async () => {
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
        <ul className="grid gap-0.5 sm:grid-cols-2">
          {v!.members.map((m, i) => {
            const online = now - m.lastSeen < HEARTBEAT_MS * 2.5;
            return (
              <li key={m.id} className="pop-in flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-hover" style={{ ['--i' as string]: i }}>
                <span className="user-avatar text-sm font-bold text-heading">{m.name[0]?.toUpperCase()}<span className="status-dot" style={online ? undefined : { background: 'rgb(var(--c-muted))' }} /></span>
                <span className="min-w-0 flex-1 truncate font-semibold">{m.name}{m.id === me.id ? ' (you)' : ''}</span>
                {m.host && <span className="chip chip-accent" title="Host"><Icon name="crown" size={12} />Host</span>}
                <span className="sr-only">{online ? 'Online' : 'Reconnecting'}</span>
              </li>
            );
          })}
        </ul>
        {humans < maxSeats && <p className="hint">{allowBots ? 'Waiting for friends? Empty seats can be filled with bots.' : 'This is a race between people: invite at least one friend.'}</p>}
      </div>
      {humans < maxSeats && <InviteFriends code={v!.code} title={title} />}

      {errorBox}
      {me.host && (
        <label className="card flex cursor-pointer items-start gap-3 p-4">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" checked={listedNow ?? v!.isPublic} disabled={room.busy}
            onChange={(e) => { setListedNow(e.target.checked); room.setPublic(e.target.checked); }} />
          <span>
            <span className="font-semibold">List in <Link href="/lobby" className="text-primary underline">Live games</Link></span>
            <span className="block text-sm text-muted">Anyone can ask to join; you choose who gets in. Your room code stays hidden.</span>
          </span>
        </label>
      )}
      <JoinRequests room={room} />
      {me.host ? (
        <div className="card space-y-3 p-4">
          {variants && variants.length > 1 && <VariantPicker variants={variants} value={variant} onChange={setVariant} disabled={room.busy} />}
          <div className="flex flex-wrap items-center gap-3">
            {allowBots && !money && <label className="flex items-center gap-2 text-sm font-semibold">Bots
              <select className="field" value={bots} onChange={(e) => setBots(Number(e.target.value))}>
                {Array.from({ length: maxBots + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>}
            {bots > 0 && !money && (
              <label className="flex items-center gap-2 text-sm font-semibold">Level
                <select className="field" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </label>
            )}
            {timer && (
              <label className="flex items-center gap-2 text-sm font-semibold">Time limit
                <select className="field" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  <option value={0}>None</option>
                  {timerOptions.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
            )}
          </div>
          {money ? (
            <>
              <button className="btn btn-success btn-lg w-full" disabled={room.busy || stakers < 2} onClick={() => { sfx('shuffle'); room.start(0, difficulty, timer ? minutes : undefined, variant && variant !== variants?.[0]?.id ? variant : undefined); }}>
                <Icon name="play" size={20} />Start game ({stakers} staked)
              </button>
              {stakers < 2 && <p className="hint text-center">At least 2 players must put their stake in.</p>}
            </>
          ) : (
            <>
              <button className="btn btn-success btn-lg w-full" disabled={room.busy || humans + bots < 2} onClick={() => { sfx('shuffle'); room.start(bots, difficulty, timer ? minutes : undefined, variant && variant !== variants?.[0]?.id ? variant : undefined); }}>
                <Icon name="play" size={20} />Start game ({humans + bots} players)
              </button>
              {humans + bots < 2 && <p className="hint text-center">You need at least 2 players. {allowBots ? 'Add a bot or invite a friend.' : 'Invite a friend.'}</p>}
            </>
          )}
        </div>
      ) : (
        <p className="card flex items-center justify-center gap-2 p-4 text-center font-semibold text-muted">
          <span className="loading-dots">Waiting for the host to start</span>
        </p>
      )}
      <button type="button" className="btn btn-ghost w-full text-danger" onClick={room.leave}><Icon name="logout" size={18} />Leave room</button>
    </div>
  );
}
